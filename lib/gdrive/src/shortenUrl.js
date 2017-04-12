var request = require('request');
var tcolorBlue = '\x1b[36m';
var tcolorReset = '\x1b[0m';
// var config = require('../../../config/google-config.json')

function shortenUrl(longUrl, job) {
  request.post('https://www.googleapis.com/urlshortener/v1/url?key=' + job.config.UrlApiKey,
  { json: { "longUrl": longUrl } },
  function (err, response, body) {
      if (err) {
        console.log(tcolorBlue, '\n[Shorten URL Error]\n', tcolorReset, err);
        return;
      } else {
        console.log(tcolorBlue, '\n[Shorten URL Response]\n', tcolorReset, body);
        console.log(tcolorBlue, '\n[Short URL]\n', tcolorReset, body.id);
        require('child_process').exec(
          'echo ' + body.id + ' | pbcopy',
          function(err, stdout, stderr) {
              console.log(tcolorBlue, '\n[Short URL Copied to clipboard]', tcolorReset); // Confirms URL has been copied
          }
      );
      }
  })
}

module.exports = shortenUrl;
