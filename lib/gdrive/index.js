var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var uploadPDF = require('./src/uploadPdf');
var logger = require('../logger.js');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/drive-nodejs-uploadPDF.json
var SCOPES = ['https://www.googleapis.com/auth/drive.file'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'drive-nodejs-uploadPDF.json';

// Checking TOKEN file to ensure it's loaded when initialized
fs.readFile(TOKEN_PATH, function(err, content) {
    if (err) {
      logger.log('TOKEN DOES NOT EXIST AT: ' + TOKEN_PATH)
      gDriveUpload(null, 'init')
    } else {
      // Check for client secrets in a local file.
      fs.readFile('config/client_secret.json', function processClientSecrets(err, content) {
          if (err) {
              logger.log('Error loading client secret file: ' + err);
              logger.log('Generate an OAuth2 Client secret from the Google Cloud console: https://console.developers.google.com/apis/credentials/oauthclient');
              process.exit(1)
          }
      });
    }
})

// Main function that initializes the upload.
function gDriveUpload(file, job) {
    // Load client secrets from a local file.
    fs.readFile('config/client_secret.json', function processClientSecrets(err, content) {
        if (err) {
            logger.log('Error loading client secret file: ' + err);
            logger.log('Generate an OAuth2 Client secret from the Google Cloud console: https://console.developers.google.com/apis/credentials/oauthclient');
            process.exit(1)
        }

        content = JSON.parse(content);

        // 'init' job gets called on startup to install the TOKEN
        if (job === 'init') {
            authorize(content, function(auth) {
                logger.log('Token created');
            });
        } else {
            // Authorize a client with the loaded credentials, then call the
            // Drive API.
            logger.log('FILENAME: ' + file.name);
            logger.log('PATH: ' + file.path);
            authorize(content, function(auth) {
                uploadPDF(auth, file, job)
            });
        }
    });
  }

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({access_type: 'offline', scope: SCOPES});
    logger.log('\n\nAuthorize this app by visiting this url:\n' + authUrl);
    var rl = readline.createInterface({input: process.stdin, output: process.stdout});
    rl.question('\n\nEnter the code from that page here: ', function(code) {
        rl.close()
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                logger.log('Error while trying to retrieve access token' + err);
                process.exit(1)
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    logger.log('Token stored to ' + TOKEN_PATH);
}

module.exports = gDriveUpload;
