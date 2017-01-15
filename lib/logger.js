/**
 * Created by bryancross on 1/14/17.
 */

var format = require('date-fns/format');  //https://github.com/date-fns/date-fns



var logger = function() {};

logger.prototype.log = function(msg, job, status, error) {
    var datestamp = format(new Date());

    if(job)
    {
        if(status)
        {
            job.status = status;
        }
        job.msgs.push({"time": datestamp, "msg": msg});
        if(error)
        {
            job.errorMessage = error.message;
            job.errors.push(error.message);
        }
    }
    console.log(datestamp + ":    " + msg);
};

module.exports = new logger();