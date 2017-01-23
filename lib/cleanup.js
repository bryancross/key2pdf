/**
 * Created by bryancross on 1/20/17.
 */
var parse = require('date-fns/parse');  //https://github.com/date-fns/date-fns
var format = require('date-fns/format');  //https://github.com/date-fns/date-fns
var differenceInMilliseconds = require('date-fns/difference_in_milliseconds'); //https://github.com/date-fns/date-fns
var http = require('http');
var logger = require('./logger.js');

var cleanup = function() {};

cleanup.prototype.cleanup = function(job)
{
    if (job.config.deleteTempDir) {
        exec("rm -rf " + job.tempDir, function (error, stdout, stderr) {
            if (error !== null) {
                logger.log('Error writing out base64: ' + error, job);
                logger.log('stdout: ' + stdout, job);
                logger.log('stderr: ' + stderr, job);
            }
            else {
                logger.log("Temporary directory deleted", job);
            }
        })
    }

    job.endTime = format(new Date());
    job.duration = differenceInMilliseconds(parse(job.endTime), parse(job.startTime)) / 1000;


    //Clean up the log by deleting redundant/unnecessary nodes from the job object
    delete job.keynoteFiles;
    delete job.github;



    //write out log file
    fs.writeFile('./log/' + job.jobID + ".json", JSON.stringify(job));

    //don't let the jobs array grow too much...

    if(jobs.length > job.jobsLimit)
    {
        jobs.splice(job.jobsLimit,1);
    }


    //execute the callback
    if(!job.config.callback)
    {
        return;
    }

    var callbackURLComps = job.config.callback.split('/');
    var hostPort = callbackURLComps[2].split(':');
    var options = {
        hostname: hostPort[0],
        port: hostPort[1],
        path: '/' + callbackURLComps[3],
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = http.request(options, function(res)
    {
        res.setEncoding('utf8');
        res.on('data', function (body) {
            //logger.log('Body: ' + body);
        });
    });
    req.on('error', function(e) {
        logger.log('Error executing callback: ' + e.message);
    });
// write data to request body
    req.write(JSON.stringify(job));
    req.end();
    logger.log("Callback executed");

};

module.exports = new cleanup();