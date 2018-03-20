'use strict';

const prettyCron = require('prettycron');
const cron       = require('cron');
const safeEval   = require('safe-eval');

const screenshot = require('./screenshot');
const config     = require('./config');
const metabase   = require('./metabase');

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
                convo.ask(`Add new report following this format: \`{team} | {channel} | {time} | {name} | {url} | {yes|no}\`. I only support team ${teams.join(' & ')} for now.`, (response, convo) => {

                    if (response.text.split('|').length !== 6) {
                        bot.reply(message, `Please look at the format above again!`);
                        convo.stop();
                        return;
                    }
                    const [team, channel, time, name, url, show_original] = response.text.split('|').map(
                        t => t.trim()
                    );
                    const show = show_original === 'yes' ? '' : 'not ';

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

                    convo.ask(`So you want to send *${name}* report \`${url}\` to channel *#${channel}* of team *${team}* at ${prettyCron.toString(time)}, and *${show}show* original url?`, [
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
                            const [team, channel, time, name, url, show_original] = content
                                .split('|')
                                .map(t => t.trim());
                            reports.list.push({
                                team, channel, time, name, url, content,
                                show_original: show_original === 'yes',
                                owner: message.user
                            });
                            // Add idx for alert list
                            let idx = 1;
                            for (let i in reports.list) {
                                if (!reports.list[i].idx) {
                                    reports.list[i].idx = idx;
                                } else {
                                    idx = reports.list[i].idx;
                                }
                                idx += 1;
                            };
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
                                .map(i => `#${i.idx}: \`${i.content}\``)
                                .join('\n')}`);
                    });
                    break;

                case 'mod':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        reports.mod = args;
                        controller.storage.teams.save(reports, (err) => {
                            if (!err) bot.reply(message, "Update mod success for " +  args.map(m => `<@${m}>`).join(', '));
                        });
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
                        if (!reports || !reports.list) return;

                        // Only owner or boss or mod can delete reports
                        const toDeleteReport = reports.list
                            .filter(l => l.idx == id)
                            .filter(l => l.owner === message.user ||
                                reports.mod && reports.mod.indexOf(message.user) > -1
                            )[0]

                        if (toDeleteReport) {
                            reports = {
                                ...reports,
                                list: reports.list.filter(
                                    r => r.idx != toDeleteReport.idx
                                )
                            };
                            controller.storage.teams.save(reports, (err) => {
                                screenshot.ssJob(controller);
                                bot.reply(message, `Report #${toDeleteReport.id}: *${toDeleteReport.name}* is deleted!`);
                            });
                        } else {
                            bot.reply(message, `You can't delete #${id}!`);
                        }
                    });
                    break;

                case 'upload':
                    controller.storage.teams.get(config.REPORT_ID, (err, reports) => {
                        if (!err) {
                            const report = reports.list.filter(r => r.idx == id)[0];
                            if (report) {
                                const [team, channel, time, name, url, show_original] = [
                                    report.team, report.channel, report.time, report.name, report.url, report.show_original
                                ];
                                const fileUrl = url.substring(1, url.length-1).replace(/&amp;/g, "&");
                                screenshot.sendScreenshot(team, channel, fileUrl, name, show_original);
                                bot.reply(message, `I will send report ${name} to channel ${channel}, wait a sec...`);
                            }
                        }
                    });
                    break;

                default:
                    bot.reply(message, 'Use `report list` to view full list, `report add`, `report delete` to change the list, `report upload` to manually upload report. And `report refresh` to refresh the list.');
            }
    });


    // Start conversation to save alert question
    controller.hears(['^alert (.*)'],
        'direct_message,direct_mention,mention,message_received',
        (bot, message) => {
            const askForAlert = (response, convo) => {
                convo.ask(`Add new alert following this format: \`{team} | {channel} | {time} | {name} | {url} | {template} | {no_list}\`. I only support team ${teams.join(' & ')} for now.`, (response, convo) => {

                    const [team, channel, time, name, url, tmp, no_list] = response.text.split('|').map(
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

                    const template = tmp.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    const msg = safeEval(
                        '`' + template + '`',
                        { count: 3, rows: ['one', 'two', 'three'] }
                    );

                    convo.ask(`So you want to send *${name}* alert of question \`${url}\` to channel *#${channel}* of team *${team}* at ${prettyCron.toString(time)}, and the message will be like this: ${msg}?`, [
                        {
                            pattern: bot.utterances.yes,
                            callback: (response, convo) => {
                                addAlert(response, convo);
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

            const addAlert = (response, convo) => {
                convo.on('end', function(convo) {
                    if (convo.status == 'completed') {
                        // Save to team data
                        controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
                            if (!alerts) {
                                alerts = {
                                    id: config.ALERT_ID,
                                    list: [],
                                    mod: []
                                };
                            }
                            const content = convo.extractResponse('content');
                            const [team, channel, time, name, url, tmp, no_list] = content
                                .split('|')
                                .map(t => t.trim());
                            const template = tmp.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                            alerts.list.push({
                                team, channel, time, name, url, content, template, no_list,
                                owner: message.user
                            });
                            // Add idx for alert list
                            let idx = 1;
                            for (let i in alerts.list) {
                                if (!alerts.list[i].idx) {
                                    alerts.list[i].idx = idx;
                                } else {
                                    idx = alerts.list[i].idx;
                                }
                                idx += 1;
                            };
                            controller.storage.teams.save(alerts, (err) => {
                                if (!err) {
                                    bot.reply(message, 'Save success!');
                                    metabase.alertJob(controller);
                                } else {
                                    bot.reply(message, "Sorry I can't save your alert for now :(")
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
                    bot.startConversation(message, askForAlert);
                    break;

                case 'list':
                    controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
                        bot.reply(message, `${alerts && alerts
                                .list
                                .map(i => `#${i.idx}: \`\`\`${i.content}\`\`\``)
                                .join('\n')}`);
                    });
                    break;

                case 'mod':
                    controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
                        alerts.mod = args;
                        controller.storage.teams.save(alerts, (err) => {
                            if (!err) bot.reply(message, "Update mod success for " +  args.map(m => `<@${m}>`).join(', '));
                        });
                    });
                    break;

                case 'raw':
                    controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
                        bot.reply(message, `\`\`\`${JSON.stringify(alerts)}\`\`\``);
                    });
                    break;

                case 'refresh':
                    metabase.alertJob(controller);
                    bot.reply(message, 'Refresh success!');
                    break;

                case 'delete':
                    controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
                        if (!alerts || !alerts.list) return;

                        // Only owner or boss or mod can delete alerts
                        const toDeleteAlert = alerts.list
                            .filter(l => l.idx == id)
                            .filter(l => l.owner === message.user ||
                                alerts.mod && alerts.mod.indexOf(message.user) > -1
                            )[0];

                        if (toDeleteAlert) {
                            alerts = {
                                ...alerts,
                                list: alerts.list.filter(
                                    l => l.idx != toDeleteAlert.idx
                                )
                            };
                            controller.storage.teams.save(alerts, (err) => {
                                metabase.alertJob(controller);
                                bot.reply(message, `Alert #${toDeleteAlert.idx}: *${toDeleteAlert.name}* is deleted!`);
                            });
                        } else {
                            bot.reply(message, `You can't delete #${id}!`);
                        }
                    });
                    break;

                case 'send':
                    controller.storage.teams.get(config.ALERT_ID, (err, alerts) => {
                        if (!err) {
                            const al = alerts.list.filter(a => a.idx == id)[0];
                            if (al) {
                                metabase.sendAlertToChannel(
                                    al.team, al.channel, al.url, al.template, al.no_list
                                );
                                bot.reply(message, `I will send alert ${al.name} to channel ${al.channel} if exists, wait a sec...`);
                            }
                        }
                    });
                    break;

                default:
                    bot.reply(message, 'Use `alert list` to view full list, `alert add`, `alert delete` to change the list, `alert send 7` to manually send alert #7. And `alert refresh` to refresh the list.');
            }
    });

};
