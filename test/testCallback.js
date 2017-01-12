/**
 * Created by bryancross on 1/10/17.
 *
 */

var http = require('http');
var HttpDispatcher = require('httpdispatcher');
var dispatcher     = new HttpDispatcher();
var format = require('date-fns/format');  //https://github.com/date-fns/date-fns

//Create a server
var server = http.createServer(dispatchRequest)

//Startup.  We're always running as a server.  It's 2017, for crissakes.
server.listen(3001, function () {
    //Callback when server is successfully listening
    console.log("Server listening on: http://localhost:3001");
});

//Dispatch request, send response
function dispatchRequest(request, response) {
    try {
        //Dispatch
        dispatcher.dispatch(request, response);

    }
    catch (e) {
        console.log(e)
    }
}

dispatcher.onPost('/status', function (req, res)
{
    var job = JSON.parse(req.body);

    console.log("*************************");
    console.log(job.endTime);
    console.log("Callback received for job: " + job.jobID.substring(10) + " status: " + job.status);
    console.log("*************************");
    res.end();
});

