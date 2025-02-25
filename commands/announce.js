const moment = require('moment');
const { name, version } = require('../package.json');
const { roles, textChannelID, prefix } = require('../config.js');
const { youtube } = require('../config/youtube');
const Vtuber = require('../models').Vtuber;
const Schedule = require('../models').Schedule;

module.exports = {
  name: 'announce',
  description: 'Announces Upcoming live and premiere immediately',
  args: true,
  async execute(message, args) {
    moment.locale('id');
    const messages =
      'Tulis formatnya seperti ini ya:\n> ```' +
      prefix +
      'announce [live/premiere] [Link Video Youtube]```';

    if (message.channel.id !== textChannelID.announce) {
      return message.reply({
        files: [{ attachment: 'https://i.imgur.com/4YNSGmG.jpg' }],
      });
    }
    if (args.length !== 2) {
      return message.reply(messages);
    }
    if (
      args[0].toLowerCase() !== 'live' &&
      args[0].toLowerCase() !== 'premiere'
    ) {
      return message.reply(messages);
    }
    message.channel.send(
      'Mohon tunggu, sedang menyiapkan data untuk dikirimkan'
    );
    const timeFormat = 'Do MMMM YYYY, HH:mm';
    const timeForDB = 'MM DD YYYY, HH:mm';
    const linkData = args[1].split('/');
    let youtubeId;
    if (linkData[0] !== 'https:' || linkData[3] === '') {
      return message.reply(messages);
    }
    switch (linkData[2]) {
      case 'www.youtube.com':
        const paramData = linkData[3].split('=');
        youtubeId = paramData[1].split('&', 1)[0];
        break;
      case 'youtu.be':
        youtubeId = linkData[3];
        break;
      default:
        return message.reply(messages);
    }
    if (youtubeId === undefined) {
      return message.reply(messages);
    }
    const exist = await Schedule.findOne({
      where: { youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}` },
    });
    if (exist) {
      return message.reply(
        `Seseorang sudah mengupload ini terlebih dahulu pada ${moment(
          exist.createdAt
        )
          .utcOffset('+07:00')
          .format(timeFormat)}`
      );
    }
    try {
      const config = {
        id: youtubeId,
        part: 'snippet,liveStreamingDetails',
        fields:
          'pageInfo,items(snippet(title,thumbnails/high/url,channelTitle,channelId),liveStreamingDetails)',
      };
      const youtubeData = await youtube.videos.list(config);
      const youtubeInfo = youtubeData.data.items[0].snippet;
      const youtubeLive = youtubeData.data.items[0].liveStreamingDetails;
      const vData = await Vtuber.findOne({
        where: {
          channelURL: `https://www.youtube.com/channel/${youtubeInfo.channelId}`,
        },
      });
      if (!vData) {
        throw {
          message: `Channel ${youtubeInfo.channelTitle} tidak ada di database kami. Channel ID: ${youtubeInfo.channelId}`,
        };
      }
      const videoDateTime = moment(youtubeLive.scheduledStartTime).utcOffset(
        '+07:00'
      );
      await Schedule.create({
        title: youtubeInfo.title,
        youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        dateTime: new Date(videoDateTime.format(timeForDB)),
        vtuberId: vData.dataValues.id,
        type: args[0].toLowerCase(),
        thumbnailUrl: youtubeInfo.thumbnails.high.url,
      });
      const liveEmbed = {
        color: parseInt(vData.dataValues.color),
        title: `${vData.dataValues.fullName} akan ${
          args[0].toLowerCase() === 'live'
            ? 'melakukan Livestream'
            : 'mengupload video baru'
        }!`,
        author: {
          name: vData.dataValues.fullName,
          icon_url: vData.dataValues.avatarURL,
          url: vData.dataValues.channelURL,
        },
        thumbnail: {
          url: vData.dataValues.avatarURL,
        },
        fields: [
          {
            name: `Tanggal & Waktu ${
              args[0].toLowerCase() === 'live' ? 'live' : 'premiere'
            }`,
            value: `${videoDateTime.format(timeFormat)} UTC+7 / WIB`,
          },
          {
            name: 'Link Video Youtube',
            value: `https://www.youtube.com/watch?v=${youtubeId}`,
          },
          {
            name: `Judul ${
              args[0].toLowerCase() === 'live' ? 'Live' : 'Video'
            }`,
            value: youtubeInfo.title,
          },
        ],
        image: {
          url: youtubeInfo.thumbnails.high.url,
        },
        footer: {
          text: `${name} v${version} - This message was created on ${moment()
            .utcOffset('+07:00')
            .format(timeFormat)}`,
        },
      };
      let mention = '';
      if (vData.dataValues.fanName || vData.dataValues.fanName === '') {
        const roleId = message.guild.roles.cache.find(
          (r) => r.name === vData.dataValues.fanName
        );
        if (roleId) {
          mention = `<@&${roleId.id}>`;
        } else {
          mention = '@here';
        }
      } else {
        mention = '@here';
      }
      const channel = message.guild.channels.cache.get(textChannelID.live);
      await channel.send({
        content: `Hi ${mention} ~\n${
          args[0].toLowerCase() === 'live'
            ? `Bakal ada livestream mendatang di tanggal **${videoDateTime.format(
                timeFormat
              )} WIB!**\nDateng yaaa~ UwU`
            : `Akan ada premiere di tanggal **${videoDateTime.format(
                timeFormat
              )} WIB!**\nNonton bareng yuk~!`
        }`,
        embeds: [liveEmbed],
      });
      return await message.reply(
        `Informasi ${args[0].toLowerCase()} sudah dikirim ke text channel tujuan.\nJudul ${
          args[0].toLowerCase() === 'live' ? 'Livestream' : 'Video'
        }: ${youtubeInfo.title}\nJadwal ${
          args[0].toLowerCase() === 'live' ? 'Livestream' : 'Premiere'
        }: ${videoDateTime.format(timeFormat)} WIB / GMT+7`
      );
    } catch (err) {
      message.reply(
        `Ada sesuatu yang salah, tapi itu bukan kamu: ${err.message}`
      );
    }
  },
};
