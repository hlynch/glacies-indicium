'use strict';
const Discord = require('discord.js');
var snoowrap = require('snoowrap');
const client = new Discord.Client();
const prefix = '!';

client.on('ready', () => {
  client.on('message', (message) => {
    if (message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(' ');
    const command = args.shift().toLowerCase();

    if (command === 'ping') {
      message.channel.send('Pong.');
    } else if (command === 'beep') {
      message.channel.send('Boop.');
    } else if (command === 'server') {
      message.channel.send(
        `Server name: ${message.guild.name}\nTotal members: ${message.guild.memberCount}`
      );
    } else if (command === 'user-info') {
      message.channel.send(
        `Your username: ${message.author.username}\nYour ID: ${message.author.id}`
      );
    } else if (command === 'reddit') {
      getRedditPost(message);
    }
  });

  console.log('ready');
});

/** Sends message on Mondays at 2:30PM, Wednesdays at 3:30PM, and Fridays at 1:00PM */
let timer = setInterval(function () {
  const now = new Date();

  if (now.getDay() == 1) {
    if (now.getUTCHours() - 7 == 15 && now.getUTCMinutes() == 30) {
      client.channels
        .fetch(process.env.CHANNEL_ID)
        .send('@everyone See you guys in one hour!');
    }
  } else if (now.getDay() === 3) {
    if (now.getUTCHours() - 7 == 16 && now.getUTCMinutes() == 30) {
      client.channels
        .fetch(process.env.CHANNEL_ID)
        .send('@everyone See you guys in one hour!');
    }
  } else if (now.getDay() === 5) {
    if (now.getUTCHours() - 7 == 14 && now.getUTCMinutes() == 0) {
      client.channels
        .fetch(process.env.CHANNEL_ID)
        .send('@everyone See you guys in one hour!');
    }
  }
}, 60 * 1000);

function getRedditPost(messageObject) {
  const r = new snoowrap({
    userAgent: 'GlaciesIndiciumDiscordBot/1.0 by Me',
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  });

  r.getTop('aww', { time: 'all', limit: 100 })
    .then((posts) =>
      posts.map((post) => ({
        author: post.author,
        link: post.url,
        redditLink: 'https://www.reddit.com' + post.permalink,
        img:
          typeof post.preview !== 'undefined' ? post.preview.images[0].source.url : null,
        title: post.title,
      }))
    )
    .then((allPosts) => sendRandomPost(messageObject, allPosts));
}

function sendRandomPost(messageObject, posts) {
  const randomPost = posts[Math.floor(Math.random() * posts.length) + 1];

  const newEmbededPost = new Discord.MessageEmbed()
    .setTitle('Title: ' + randomPost.title)
    .setURL(randomPost.redditLink)
    .setImage(randomPost.img);

  messageObject.channel.send(newEmbededPost);
}

client.login(process.env.BOT_TOKEN);
