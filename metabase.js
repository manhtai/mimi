'use strict';

const request = require('request-promise-native');
const config  = require('./config');
const utils   = require('./utils');
const cron    = require('cron');


let r = request.defaults({
    baseUrl: config.METABASE_URL
});


const metabaseLogin = async() => {
    let result;
    try {
        result = await r.post({
            url: '/api/session',
            json: true,
            body: {
              username: config.METABASE_USERNAME,
              password: config.METABASE_PASSWORD,
            }
        });
    } catch (e) {
        console.log("Error while logging into Metabase: ", e.message);
    }
    if (result && result.id) {
        r = r.defaults({ headers: { "X-Metabase-Session": result.id } });
    }
    return r;
};


const getResultFromQuestion = async(id) => {
    const url = `/api/card/${id}/query`;
    let result;
    try {
        result = await r.post({ url: url });
    } catch (e) {
        if (e.statusCode === 401) {
            r = await metabaseLogin();
            try {
                result = await r.post({ url: url });
            } catch (e) {
                console.log("Error while getting data from Metabase 2nd time: ", e.message);
            }
        } else {
            console.log("Error while getting data from Metabase 1st time: ", e.message);
        }
    }
    return result;
};


const sendAlertToChannel = async(team, channel, url, template) => {
    let id = url.match(/question\/(\d+)/);
    id = id && id[1];
    if (id) {
        const resp = await getResultFromQuestion(id);
        const result = JSON.parse(resp);
        if (result && result.row_count) {
            const message = template.replace('{count}', result.row_count);
            const text = `${message}\nXem chi tiết tại ${url}`;
            utils.postMessageToChannel(team, channel, text);
        }
    }
};


// Cron part, for sending alerts in a specific time
const clearAlerts = (controller) => {
  controller.alerts = controller.alerts || [];
  controller.alerts.forEach(j => j.stop());
  controller.alerts = [];
};


const alertJob = (controller) => {
  clearAlerts(controller);
  controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
    if (!err) {
      alerts && alerts.list && alerts.list.map((al) => {
        const [team, channel, time, template, url] = [
          al.team, al.channel, al.time, al.template, al.url,
        ];
        const myJob = new cron.CronJob({
          cronTime: time,
          onTick: () => {
            sendAlertToChannel(team, channel, url, template);
          },
          start: true,
          timeZone: config.TIME_ZONE
        });
        controller.alerts.push(myJob);
      });
    }
  });
};

module.exports = {
    sendAlertToChannel,
    alertJob,
};
