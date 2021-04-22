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

    switch (command) {
      case 'ping':
        message.channel.send('Pong.');
      case 'beep':
        message.channel.send('Boop.');
      case 'server':
        message.channel.send(
          `Server name: ${message.guild.name}\nTotal members: ${message.guild.memberCount}`
        );
      case 'user-info':
        message.channel.send(
          `Your username: ${message.author.username}\nYour ID: ${message.author.id}`
        );
      case 'reddit':
        getRedditPost(message);
    }
  });
});

/** Sends message on Mondays at 3:30PM, Wednesdays at 4:30PM, and Fridays at 1:00PM */
let timer = setInterval(function () {
  const now = new Date();

  switch (now.getDay()) {
    case 1:
      if (
        now.getUTCHours() - 7 == 15 &&
        now.getUTCMinutes() == 30 &&
        now.getFullYear() == 2021
      ) {
        send_reminder();
      }
    case 3:
      if (
        now.getUTCHours() - 7 == 16 &&
        now.getUTCMinutes() == 30 &&
        now.getFullYear() == 2021
      ) {
        send_reminder();
      }
    case 5:
      if (
        now.getUTCHours() - 7 == 13 &&
        now.getUTCMinutes() == 0 &&
        now.getFullYear() == 2021
      ) {
        send_reminder();
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

function send_reminder() {
  client.channels.cache
    .get(process.env.CHANNEL_ID)
    .send('@everyone See you guys in one hour!');
}

client.login(process.env.BOT_TOKEN);
