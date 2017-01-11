/**
 * Created by bryancross on 1/11/17.
 */
var http = require('http');
var params = require('./test-params.json');


if(process.argv.length != 3)
{
    console.log("Usage: node testStatus.js <jobID>");
    process.exit(1);
}

var jobID = process.argv[2];


    var options = {
        host: '127.0.0.1',
        path: '/status',
        port: '3000',
        method: 'POST'
    };

    callback = function (response) {
        var str = ''
        response.on('data', function (chunk) {
            str += chunk;
        });

        response.on('end', function () {
            console.log(str);
        });
    }


    var req = http.request(options, callback);
    req.write(JSON.stringify({jobID:jobID}));
    req.end();
