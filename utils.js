'use strict';

const request = require('request');
const moment  = require('moment-timezone');

const config = require('./config');


const postImageToChannel = (team, channel, buffer, name, initial_comment) => {
  const imageUpload = "https://slack.com/api/files.upload";
  const token = config.SLACK_API_TOKEN[team.toLowerCase()];
  const fileName = `${name} ${moment().tz(config.TIME_ZONE).format("D-M-YYYY_HH.mm")} report.png`;
  const formData = {
      username: config.SLACK_NAME,
      token: token,
      file: {
        value: buffer,
        options: {
          filename: fileName,
          contentType: 'image/png'
        }
      },
      filename: fileName,
      channels: channel
  };

  if (initial_comment) {
    formData.initial_comment = initial_comment;
  }

  request.post({
      url: imageUpload,
      formData: formData,
    },
    (error, response, body) => {
      console.log(body);
    });
};


const postMessageToChannel = (team, channel, message) => {
    const postMessageAPI = "https://slack.com/api/chat.postMessage";
    const token = config.SLACK_API_TOKEN[team.toLowerCase()];
    console.log(`Send message ${message} to ${team}:${channel}`);
    request.post({
        url: postMessageAPI,
        formData: {
            username: config.SLACK_NAME,
            icon_url: "https://vicare.vn/static/img/default-staff.png",
            token: token,
            text: message,
            channel: channel
        },
      },
      (error, response, body) => {
          console.log(body);
    });
};


module.exports = {
    postImageToChannel,
    postMessageToChannel
};
