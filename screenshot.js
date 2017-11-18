const express     = require('express');
const fs          = require("fs");
const path        = require("path");
const crypto      = require('crypto');
const puppeteer   = require('puppeteer');
const querystring = require('querystring');
const cron        = require('cron');

const utils  = require('./utils');
const config = require('./config');

const temp_dir = path.join(process.cwd(), 'temp/');
const router = express.Router();


// Misc function for taking screenshot
const getScreenShot = async(url, clip, timeout = 1000) => {
  console.log("Start getting screenshot...", url, clip, timeout);
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.setViewport({
    width: 2048,
    height: 1536
  });
  await page.goto(url);
  await page.waitFor(timeout);
  const buffer = await page.screenshot({
    clip
  });
  await browser.close();
  console.log("End getting screenshot...");
  return buffer;
};


const sendScreenshot = async(team, channel, url, name) => {
  const [_, query] = url.split('?');
  const params = querystring.parse(query);
  const clip = {
    x: parseInt(params.x),
    y: parseInt(params.y),
    width: parseInt(params.w),
    height: parseInt(params.h)
  };
  let timeout = params.t || 1000;
  timeout = parseInt(timeout);

  const buffer = await getScreenShot(params.url, clip, timeout);
  utils.postImageToChannel(team, channel, buffer, name);
};


// Router part, for preview reports
router.get('/', async (req, res) => {
    const url = req.query.url;
    const timeout = parseInt(req.query.t || 1000);
    const xywh = [req.query.x, req.query.y, req.query.w, req.query.h];
    const [x, y, width, height] = xywh.map(i => !isNaN(i) ? parseInt(i): 0);
    const clip = { x, y, width, height };

    const filename = `${crypto.createHash('md5').update(req.url).digest("hex")}.png`;

    // Send link to file
    const link = `/screenshot/${filename}`;
    res.render('screenshot', { link });

    // Create /temp folder
    if (!fs.existsSync(temp_dir)) fs.mkdirSync(temp_dir);

    // Only write file to local if file does not exist
    const filepath = path.resolve(temp_dir, filename);
    const filetemp = filepath + '_temp';

    if (fs.existsSync(filepath) || fs.existsSync(filetemp)) return;
    fs.writeFileSync(filetemp, 'temp');

    try {
        const buffer = await getScreenShot(url, clip, timeout);
    } finally {
        fs.unlinkSync(filetemp);
    }

    fs.writeFile(filepath, buffer, (err) => {
        if (err) console.log(`Error while writing file for url ${url}`, err);
    });
});


router.get('/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filepath = path.resolve(temp_dir, filename);
    if (fs.existsSync(filepath)) res.sendFile(filepath);
    else res.sendFile(path.resolve('spin.gif'));
});


// Cron part, for send reports in a specific time
const clearReports = (controller) => {
  controller.reports = controller.reports || [];
  controller.reports.forEach(j => j.stop());
  controller.reports = [];
};


const ssJob = (controller) => {
  clearReports(controller);
  controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
    if (!err) {
      reports && reports.list && reports.list.map((report) => {
        const [team, channel, time, name, url] = [
          report.team, report.channel, report.time, report.name, report.url
        ];
        const fileUrl = url.substring(1, url.length-1).replace(/&amp;/g, "&");
        const myJob = new cron.CronJob({
          cronTime: time,
          onTick: () => {
            sendScreenshot(team, channel, fileUrl, name);
          },
          start: true,
          timeZone: config.TIME_ZONE
        });
        controller.reports.push(myJob);
      });
    }
  });
};


module.exports = {
    router,
    ssJob,
};
