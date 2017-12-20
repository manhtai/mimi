'use strict';

const Botkit     = require('botkit');
const express    = require('express');
const bodyParser = require('body-parser');

const config     = require('./config');
const screenshot = require('./screenshot');


const controller = Botkit.slackbot({
    storage: config.MONGOSTORAGE,
    debug: true
});


const bot = controller.spawn({
    token: config.API_TOKEN
});


bot.startRTM((err) => {
    if (err) {
        process.exit(1);
    }
});

controller.on('rtm_close', () => {
    process.exit(1);
});

// Chat
require('./chat')(controller);
// Screenshot CronJob
screenshot.ssJob(controller);

// Setup server
var static_dir =  __dirname + '/public';
var webserver = express();

webserver.enable('trust proxy'); // For using with Heroku
webserver.set('view engine', 'pug');

webserver.use(bodyParser.json());
webserver.use(bodyParser.urlencoded({ extended: true }));
webserver.use(express.static(static_dir));

webserver.get('/', (req, res) => { res.send('Hi, I am Mimi bot!'); });
webserver.use('/screenshot', screenshot.router);

// Attach webserver to controller
controller.webserver = webserver;
controller.config.port = config.PORT;

controller.createWebhookEndpoints(webserver);

webserver.listen(config.PORT);
