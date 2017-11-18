'use strict';

const prettyCron = require('prettycron');
const cron       = require('cron');

const screenshot = require('./screenshot');
const config     = require('./config');
const utils      = require('./utils');

const teams = [];

for (let t in config.SLACK_API_TOKEN) {
    teams.push(t);
}


module.exports = (controller) => {

    // Start conversation to save report links
    controller.hears(['^report (.*)'],
        'direct_message,direct_mention,mention,message_received',
        (bot, message) => {
            const askForReport = (response, convo) => {
                convo.ask(`Add new report following this format: \`{team} | {channel} | {time} | {name} | {url}\`. I only support team ${teams.join(' & ')} for now.`, (response, convo) => {

                    if (response.text.split('|').length !== 5) {
                        bot.reply(message, `Please look at the format above again!`);
                        convo.stop();
                        return;
                    }
                    const [team, channel, time, name, url] = response.text.split('|').map(
                        t => t.trim()
                    );

                    if (!(team.toLowerCase() in config.SLACK_API_TOKEN)) {
                        bot.reply(message, `I told you I only support ${teams.join(' & ')}!`);
                        convo.stop();
                        return;
                    }

                    try {
                        new cron.CronJob(time, () => {});
                    } catch (ex) {
                        bot.reply(message, `Pattern of cron time: ${time} is not valid!`);
                        convo.stop();
                        return;
                    }

                    convo.ask(`So you want to send *${name}* report \`${url}\` to channel *#${channel}* of team *${team}* at ${prettyCron.toString(time)}?`, [
                        {
                            pattern: bot.utterances.yes,
                            callback: (response, convo) => {
                                addReport(response, convo);
                                convo.next();
                            }
                        },
                        {
                            pattern: bot.utterances.no,
                            callback: (response, convo) => {
                                convo.stop();
                            }
                        },
                        {
                            default: true,
                            callback: (response, convo) => {
                                convo.repeat();
                                convo.next();
                            }
                        }
                    ]);

                    convo.next();

                }, {'key': 'content'});
            };

            const addReport = (response, convo) => {
                convo.on('end', function(convo) {
                    if (convo.status == 'completed') {
                        // Save to team data
                        controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                            if (!reports) {
                                reports = {
                                    id: config.REPORT_ID,
                                    list: [],
                                    mod: []
                                };
                            }
                            const content = convo.extractResponse('content');
                            const [team, channel, time, name, url] = content
                                .split('|')
                                .map(t => t.trim());
                            reports.list.push({
                                team, channel, time, name, url, content,
                                owner: message.user
                            });
                            controller.storage.teams.save(reports, (err) => {
                                if (!err) {
                                    bot.reply(message, 'Save success!');
                                    screenshot.ssJob(controller);
                                } else {
                                    bot.reply(message, "Sorry I can't save your report for now :(")
                                }
                            });
                        });

                    } else {
                        // this happens if the conversation ended prematurely for some reason
                        bot.reply(message, `OK, nevermind! ${cool()}`);
                    }
                });
            };

            const [command, ...args] = message.match[1].split(' ').map(i => i.trim());
            const id = args[0];

            switch (command) {
                case 'add':
                    // Ask to add new report
                    bot.startConversation(message, askForReport);
                    break;

                case 'list':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        bot.reply(message, `${reports && reports
                                .list
                                .map((i, idx) => `#${idx+1}: \`${i.content}\``)
                                .join('\n')}`);
                    });
                    break;

                case 'mod':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        if (message.user === config.BOT_BOSS) {
                            reports.mod = args;
                            controller.storage.teams.save(reports, (err) => {
                                if (!err) bot.reply(message, "Update mod success!");
                            });
                        }
                    });
                    break;

                case 'raw':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        bot.reply(message, `\`\`\`${JSON.stringify(reports)}\`\`\``);
                    });
                    break;

                case 'refresh':
                    screenshot.ssJob(controller);
                    bot.reply(message, 'Refresh success!');
                    break;

                case 'delete':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        // Only owner or boss or mod can delete reports
                        const listCanDelete = reports.list
                            .map((l, idx) => ({ ...l, idx }))
                            .filter((l, idx) => idx == id - 1)
                            .filter(l => l.owner === message.user ||
                                message.user === config.BOT_BOSS ||
                                reports.mod && reports.mod.indexOf(message.user) > -1
                            )
                            .map(l => l.idx);

                        const newList = reports.list.filter((l, idx) => listCanDelete.indexOf(idx) === -1);

                        if (newList.length !== reports.list.length) {
                            reports = {
                                ...reports,
                                list: newList
                            };
                            controller.storage.teams.save(reports, (err) => {
                                screenshot.ssJob(controller);
                                bot.reply(message, `#${id} is deleted!`);
                            });
                        } else {
                            bot.reply(message, `You can't delete #${id}!`);
                        }
                    });
                    break;

                case 'upload':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        if (!err) {
                            const report = reports.list.filter((r, idx) => idx == id - 1)[0];
                            if (report) {
                                const [team, channel, time, name, url] = [
                                    report.team, report.channel, report.time, report.name, report.url
                                ];
                                const fileUrl = url.substring(1, url.length-1).replace(/&amp;/g, "&");
                                utils.sendScreenshot(team, channel, fileUrl, name);
                                bot.reply(message, `I will send report ${name} to channel ${channel}, wait a sec...`);
                            }
                        }
                    });
                    break;

                default:
                    bot.reply(message, 'Use `report add`, `report list`, `report delete` to change report list. And `report refresh` to refresh the list.');
            }
    });

};
