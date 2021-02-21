const Discord = require('discord.js');

const client = new Discord.Client();

client.on('ready', () => {
  client.channels
    .get('812823537953538091')
    .send('Welcome, I will now remind everyone every week!');
});

client.on('message', (message) => {
  if (message.content === 'ping') {
    message.reply('pong');
  }
});

/** Sends message on Mondays at 2:30PM, Wednesdays at 3:30PM, and Fridays at 1:00PM */
let timer = setInterval(function () {
  const now = new Date();

  if (now.getDay() == 1) {
    if (now.getUTCHours() - 7 == 14 && now.getUTCMinutes() == 30) {
      client.channels
        .get('812823537953538091')
        .send('@everyone See you guys in one hour!');
    }
  } else if (now.getDay() === 3) {
    if (now.getUTCHours() - 7 == 15 && now.getUTCMinutes() == 30) {
      client.channels
        .get('812823537953538091')
        .send('@everyone See you guys in one hour!');
    }
  } else if (now.getDay() === 5) {
    if (now.getUTCHours() - 7 == 13 && now.getUTCMinutes() == 0) {
      client.channels
        .get('812823537953538091')
        .send('@everyone See you guys in one hour!');
    }
  }
}, 60 * 1000);

client.login(process.env.BOT_TOKEN);
