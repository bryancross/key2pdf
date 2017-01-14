/**
 * Created by bryancross on 1/11/17.
 */
/*

Utility to test commits without having to actually do them in GitHub.

To use:

1) Capture a commit payload
2) Save it to a file, ../payloads/commit-payload.json
3) Run ../script/testCommit.sh

 */


var http = require('http');
var params = require('./test-params.json');
var fs = require('fs');
var payload = JSON.parse(fs.readFileSync('./payloads/commit-payload.json'));

    var options = {
        host: '127.0.0.1',
        path: '/pushhook',
        port: '3000',
        method: 'POST',
        //This is the only line that is new. `headers` is an object with the headers to request

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
    req.write(JSON.stringify(payload));
    req.end();