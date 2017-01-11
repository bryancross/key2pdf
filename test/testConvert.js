/**
 * Created by bryancross on 1/10/17.
 */

var http = require('http');
var params = require('./test-params.json');


for (var i = 0; i < params.testCases.length; i++) {
    var options = {
        host: '127.0.0.1',
        path: '/convert',
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
    req.write(JSON.stringify(params.testCases[i]));
    req.end();
}