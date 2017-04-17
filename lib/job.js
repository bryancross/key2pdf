/**
 * Created by bryancross on 1/14/17.
 */

var parse = require('date-fns/parse');  //https://github.com/date-fns/date-fns
var format = require('date-fns/format');  //https://github.com/date-fns/date-fns
var fs = require('fs');
var crypto = require('crypto');
var GitHubClient = require("github"); //https://github.com/mikedeboer/node-github
var differenceInMilliseconds = require('date-fns/difference_in_milliseconds'); //https://github.com/date-fns/date-fns


module.exports = Job;

function Job(config)
{
    this.jobID = crypto.randomBytes(20).toString('hex');
    if(config == null)
    {
        return;
    }

    this.config(config);
};

Job.prototype.config = function(config){

    this.config = config;
    this.startTime = format(new Date());
    //Assign a (hopefully) unique ID
    this.msgs = [];
    this.errors = [];
    this.files = [];
    this.PDFs = [];

    this.config.workingDir = this.config.workingDir + "/" + this.jobID;
    fs.mkdirSync(this.config.workingDir);


    //  Create a github client using the node-github API https://github.com/mikedeboer/node-github
    var github = new GitHubClient({
        debug: this.config.GitHubAPIDebug
        ,pathPrefix: this.config.targetHost.includes("github.com") ? "" : "/api/v3"
        ,host: this.config.targetHost === 'github.com' ? 'api.github.com' : this.config.targetHost
        ,protocol: "https"
        ,headers: {"user-agent":"repo-template"}
    });

    var authType = !this.config.authType ? this.config.authType : this.config.authType;

    //Create an auth object using configured values.  Will be used to authenticate the GitHub client
    var auth = {
        type: authType
        , token: this.config.GitHubPAT
        , username: this.config.GitHubUsername
    };
    //authenticate using configured credentials
    github.authenticate(auth);
    //attach the client to the job object
    this.github = github;
}

Job.prototype.dumpConfig = function() {
    console.log("Config: " + JSON.stringify(this.config));
};

Job.prototype.getHTML = function ()
{
    var logData = this.cleanse();
    logDataHTML="<!DOCTYPE html><html><body><h2>Repository Creation Job: " + logData.jobID + " Status: " + logData.status + " </h2><br/><pre>" + JSON.stringify(logData,null,4) + "</pre></body></html>"
    return logDataHTML;
};

Job.prototype.cleanse = function()
{
    var logContent = {"jobID":this.jobID
        ,"source":this.source
        ,"startTime":this.startTime
        ,"endTime":format(new Date())
        ,"status":this.status
        ,"duration":differenceInMilliseconds(parse(this.endTime), parse(this.startTime)) / 1000}
    logContent.msgs = JSON.parse(JSON.stringify(this.msgs));
    logContent.errors = JSON.parse(JSON.stringify(this.errors));
    logContent.config = JSON.parse(JSON.stringify(this.config));
    logContent.config.GitHubPAT = "--redacted--";
    logContent.repoConfig = this.repoConfig;
    logContent.repository = this.repository;
    delete logContent.config.repoConfigs;
    if(logContent.config.adminGitHubPAT)
    {
        logContent.config.adminGitHubPAT="--redacted--"
    }
    if(logContent.config.userPAT)
    {
        logContent.config.userPAT="--redacted-->";
    }
    return logContent;
};

Job.prototype.flushToFile = function () {
    var logContent = this.cleanse();
    fs.writeFile("./log/" + this.jobID + ".json", JSON.stringify(logContent), function(err)
    {
        if(err)
        {
            //console.log("Error writing job log to file: " + err)
            var e = {"message":"Error writing job log to file" + err};
            throw(e);
       }
    });
    if(this.config.deleteTempDir)
    {
        fs.rmdirSync(this.config.workingDir + "/" + this.jobID);
    }
};
