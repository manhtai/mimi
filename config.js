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

const METABASE_URL = process.env.METABASE_URL;
const METABASE_USERNAME = process.env.METABASE_USERNAME;
const METABASE_PASSWORD = process.env.METABASE_PASSWORD;


module.exports = {
    TIME_ZONE,
    SLACK_NAME,
    PORT,
    API_TOKEN,
    MONGOSTORAGE,
    SLACK_API_TOKEN,
    REPORT_ID,
    METABASE_URL,
    METABASE_USERNAME,
    METABASE_PASSWORD
};
