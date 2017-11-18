'use strict';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const SLACK_NAME = 'mimi';

const PORT = process.env.PORT || 8445;
const API_TOKEN = process.env.API_TOKEN;

const mongoUri = process.env.MONGODB_URI || `mongodb://localhost/${SLACK_NAME}`;
const MONGOSTORAGE = require('botkit-storage-mongo')({mongoUri: mongoUri});


const SLACK_API_TOKEN = {};
process.env.SLACK_API_TOKEN && process.env.SLACK_API_TOKEN.split('|').map(
    (tt) => {
        const [team, token] = tt.split(':');
        SLACK_API_TOKEN[team] = token;
    }
);

const REPORT_ID = 'REPORT';


module.exports = {
    TIME_ZONE,
    SLACK_NAME,
    PORT,
    API_TOKEN,
    MONGOSTORAGE,
    SLACK_API_TOKEN,
    REPORT_ID,
};
