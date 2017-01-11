/**
 * Created by bryancross on 12/27/16.
 */

"use strict";

global.jobs = [];

var util = require('util');
var crypto = require('crypto');
var exec = require('child_process').exec;
var GitHubClient = require("github"); //https://github.com/mikedeboer/node-github
var globalJobTemplate = require("./config/job-template.json");
var fs = require('fs');
var http = require('http');
var dispatcher = require('httpdispatcher');
const PORT = 3000;
var parse = require('date-fns/parse');  //https://github.com/date-fns/date-fns
var format = require('date-fns/format');  //https://github.com/date-fns/date-fns
var differenceInMilliseconds = require('date-fns/difference_in_milliseconds'); //https://github.com/date-fns/date-fns
var github;


//Setup some default configuration parameters based on the values in ./config/config.json.  These
//will mostly be overwritten in scenarios where key2pdf runs as a server and/or accepts a URL argument.
//But if you want to just run it on the command line with nothin', you can

//GitHub Enterprise uses /api/v3 as a prefix to REST calls, while GitHub.com does not.
globalJobTemplate.pathPrefix = (globalJobTemplate.targetHost !== "github.com") ? "/api/v3" : "";

//If we're going to GitHub, prepend the host with 'api', otherwise leave it be
globalJobTemplate.targetHost = (globalJobTemplate.targetHost === "github.com") ? "api.github.com" : globalJobTemplate.targetHost;

//Dispatch request, send response
function dispatchRequest(request, response) {
    try {
        //Dispatch
        dispatcher.dispatch(request, response);

    }
    catch (e) {
        log(e)
    }
}



//Create a server
var server = http.createServer(dispatchRequest)

//Startup.  We're always running as a server.  It's 2017, for crissakes.
server.listen(globalJobTemplate.listenOnPort == null ? PORT : globalJobTemplate.listenOnPort, function () {
    //Callback when server is successfully listening
    log("Server listening on: http://localhost: " + PORT);
});


//Replace any global config paramter with parameters
//passed in the http request
function updateConfigFromParams(request, job) {
    var urlComps = request.url.split("/");
    
    //Assuming a URL in one of 2 forms:
    // For a single file: https://<host>/<owner>/<repo>/blob/<branch>/<path>
    // For an entire repo: https://<host>/<owner>/<repo>

    job.config.targetHost = urlComps[2];
    job.config.owner = urlComps[3];
    job.config.targetRepo = urlComps[4];


    //Replace any global config values with values passed in in the request.
    job.config.callback = (request.callback) ? request.callback : "";
    job.config.GitHubPAT = (request.GitHubPAT) ? request.GitHubPAT : globalJobTemplate.GitHubPAT;


    //if there's only 5 url comps, there's no branch and we're doing the whole repo
    //so default to master
    if (urlComps.length < 6) {
        job.config.targetBranch = 'master'
    }
    else {
        job.config.targetBranch = urlComps[6];
    }

    job.config.filePath = "";

    for (var i = 7; i < urlComps.length; i++) {
        job.config.filePath = (job.config.filePath === "" ? job.config.filePath + urlComps[i] : job.config.filePath + "/" + urlComps[i]);
    }

    //GitHub Enterprise uses /api/v3 as a prefix to REST calls, while GitHub.com does not.
    job.config.pathPrefix = (job.config.targetHost !== "github.com") ? "/api/v3" : "";

    //If we're going to GitHub, prepend the host with 'api', otherwise leave it be
    job.config.targetHost = (job.config.targetHost === "github.com") ? "api.github.com" : job.config.targetHost;

}

//handle a call to /status.  Find the job in global.jobs, or if it isn't in the array find the log directory, and
//return the job log data.
dispatcher.onPost('/status', function (req, res) {
    var jobID = JSON.parse(req.body).jobID;
    ///Search the array of jobs in memory
    for (var i = 0; i < global.jobs.length; i++) {
        if (global.jobs[i].jobID === jobID) {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end(JSON.stringify(global.jobs[i]));
            return;
        }
    }

    //If we're still here the job is finished and the job object deleted from the global array
    //So let's see if there's info in the log...
    try
    {
        var logData = fs.readFileSync('./log/' + jobID + '.json', "UTF-8");
        logData = JSON.stringify(logData);
        res.end(logData);
        return;
    }
    catch(err)
    {
        //no file found
        if(err.errno === -2)
        {
            res.end("No job data found for job ID: " + jobID);
        }
        //something else went wrong
        else
        {
            res.end('Error retrieving log file for job ID: ' + jobID + " " + err.message);
        }

        return;
    }
    //We didn't find any log data
    res.end('No job found for jobID: ' + jobID);
});


dispatcher.onPost('/pushhook', function (req, res) {

console.log(req);


});
/**
 *  dispatcher.onPost(request, response) -> null
 *
 *      HTTP request parameters include:
 *          url - The URL to convert.  Expecting the same construction as if copied from a browser address bar
 *              convert all the keynotes in a repo: http(s)://<host>/<owner>/<repo>
 *              convert a single file: http(s)://<host>/<owner>/<repo>/blob/<branch>/<path to file>....
 *          callback (optional) - URL to call back with status info when the convert job completes
 *          GitHubPAT (optional) - Properly scoped PAT for the url specified.
 *
 *      Create PDF renditions of a single keynote file or all the keynote files in a repository and upload
 *      the PDFs back to the repository.  Optionally callback with status information
 **/
dispatcher.onPost('/convert', function (req, res) {

    var filePath = "";
    var config;
    var job = initJob();



    if (req.body === "")
    {
        res.writeHead(406, {'Content-Type': 'text/plain'});
        res.end('No parameters found in request');
        return;
    }
    else {
        try {
            var params = JSON.parse(req.body);
            updateConfigFromParams(params, job);
            //Create an auth object using configured values.  Will be used to authenticate the GitHub client
            var auth = {
                type: job.config.authType
                , token: job.config.GitHubPAT
                , username: job.config.user
            };


//  Create a github client using the node-github API https://github.com/mikedeboer/node-github
            var github = new GitHubClient({
                //debug: true,
                pathPrefix: job.config.pathPrefix
                /*protocol: "https",
                host: job.config.targetHost,
                headers: {"user-agent": job.config.userAgent},
                Promise: require('bluebird'),
                followRedirects: false,
                timeout: 5000
                */
            });

//authenticate using configured credentials
            github.authenticate(auth);

//Attach the new client to the job objects
            job.github = github;

            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end(JSON.stringify({msg: "Conversion request recieved", jobID: job.jobID}));
            log("Path: " + job.filePath, job, "Processing");
            //All is well, let's go convert!
            //We pass the job object around to preserve state and specific configuration data for each request
            //Another approach would be to create an object for each job, but this approach works just as well
            convertFiles(job);

        }
        catch (err) {
            res.writeHead(406, {'Content-Type': 'text/plain'});
            res.end('Error initializing' + err.message);
            log("Error initializing: " + err.message, job, "Failed", err);
            cleanup(job);
            return;
        }
    }


});

//setup the job from the template in ./config/job-template.json
function initJob()
{
    var job = JSON.parse(JSON.stringify(globalJobTemplate));
    job.startTime = format(new Date());
    //Assign a (hopefully) unique ID
    job.jobID = crypto.randomBytes(20).toString('hex');
    job.keynoteFiles = [];
    global.jobs.push(job);
    return job;
}


//Get the current branch, then get the tree, then download all the keynotes contained in the tree
//FYI: It seems like the err, res are in the wrong order in in all node-github API calls.  So, even though it's weird to be using the err object, it matches the pattern
//in the API documentation

function convertFiles(job) {

    var tree = [];
    //create a temp directory.
    var mkdirp = require('mkdirp'); //https://www.npmjs.com/package/mkdirp
    //Push the temp dir path onto the job object for use later
    job.tempDir = './job/' + job.jobID;
    //Use mkdirp to safely create the temp directory
    mkdirp(job.tempDir, function (err) {
        if (err != null) {
            log("Fatal error creating temp directory: " + err.message, job, "Failed");
            job.errorMessage = err.message;
            cleanup(job);
        }

    });

    log("Temp directory: " + job.tempDir, job);

    //get the HEAD commit for the target branch
    //try {
    job.github.repos.getBranch({
        owner: job.config.owner,
        repo: job.config.targetRepo,
        branch: job.config.targetBranch
    }).then(function (err, res) {
        job.github.gitdata.getTree({
            owner: job.config.owner,
            repo: job.config.targetRepo,
            sha: err.commit.commit.tree.sha,
            recursive: true
        }).then(function (err, res)
            //If a path was provided, traverse the tree and look for just that single file
            //otherwise get all the keynote files
        {
            if (!job.config.filePath) {
                log("Processing all files in repository: " + job.config.targetRepo, job)
                //send the entire tree over to getFiles
                tree = err.tree;
            }
            else {
                for (var i = 0; i < err.tree.length; i++) {
                    if (err.tree[i].path === job.config.filePath) {
                        //create a tree for our single file
                        tree.push(err.tree[i]);
                        log("Processing single file: " + tree[0].path, job)
                        break;


                    }
                }
                if (tree.length === 0) {
                    log("No file found in repository for path: " + job.filePath, job, "Failed");
                    job.errorMessage = "No file found in repository for path: " + job.filePath, job, "Failed";
                    cleanup(job);
                    return;
                }
                //go get the files
                getFiles(tree, job);
            }
        })
        //This catch block is never called, apparently, in the case of a failed GitHub API call, e.g.,
        //bad credentials
            .catch(function (err) {
                log("Error in convertFiles: " + err.message, job, "Failed", err);
                cleanup(job);
            })
    })
}

//Traverse the tree and find all the paths that end in '.key'. Presumably these are keynote files.
//Then download all of them
//Then pass the keynote files to the cloud convert API
//Then store the resulting PDF in the temp directory
//The calls to getBlob() are all asynch, so we maintain an array of keystone files
//and remove each file from the array as it completes this process
//This ensures we don't move on to creating a new tree, etc., until all the keynotes have been converted
//and the PDF blobs created
function getFiles(tree, job) {
    var curItem;

    for (var i = 0; i < tree.length; i++) {
        curItem = tree[i];
        //look for files matching *.key....
        if ((/\.(key)$/i).test(curItem.path)) {
            //Found one!
            //Update the list of keynote files
            job.keynoteFiles.push(curItem)
            job.files.push(curItem);
            //Download the file
            downloadKeynote(curItem, job)
        }
    }
}

function downloadKeynote(keynote, job) {
    var path = job.tempDir + "/" + keynote.path.substr(keynote.path.lastIndexOf("/") + 1);
    log("Beginning content download for: " + keynote.path + " (" + keynote.sha + ")", job);
    //Use the gitdata API to download the blob to our temporary directory
    //Async call, so use promises to pipe result to the convertKeynote function
    job.github.gitdata.getBlob({owner: job.config.owner, repo: job.config.targetRepo, sha: keynote.sha})
        .then(function (err, res) {
            // Content is delivered by the GitHub API as base64 encoded text
            // Write the content to the temp directory, base64 decoding it along the way
            fs.writeFile(path, new Buffer(err.content, "base64"), function (error) {
                if (error) {
                    //Probably should do something more useful here
                    log("Error downloading file: " + error.message, job, "File download failed", error);
                }
                //update the user
                log("Content downloaded for: " + keynote.path + " (" + keynote.sha + ")", job);
                //send the file for conversion
                convertKeynote(keynote, path, job);
            })
        })
}

function convertKeynote(keynote, path, job) {
    log("Converting " + keynote.path + " to PDF via CloudConvert", job);

    //Initialize the cloudconvert API using our cloudconvert API token.
    var cloudconvert = new (require('cloudconvert'))(job.config.cloudConvertAPIToken);

    //Pipe the cloudconvert results to a file in the temp dir.  By convention we just tack on .pdf to the keynote filename.
    //then create a new blob from the new PDF file
    fs.createReadStream(path)
        .pipe(cloudconvert.convert({
            "inputformat": "key",
            "outputformat": "pdf",
            "input": "upload",
            "wait": "true",
            "download": "true"
        }))
        .pipe(fs.createWriteStream(path + '.pdf'))
        .on('finish', () => {
                    log("Conversion of " +keynote.path + " complete", job);
                    createNewBlobFromFile(path, keynote, job);
                    })
        .on('error', () => {
        log("Conversion of " +keynote.path + " failed", job,"Conversion failure for: " + path,error)});

}

function createNewBlobFromFile(path, keynote, job) {

    log("Creating new Blob for " + keynote.path + ".pdf", job);

    //Could not figure out a native node/JS solution for this.  The documented functions didn't work
    //So, we just use the shell tools to base 64 encode the PDF file.
    exec("base64 -i " + path + ".pdf" + " -o " + path + ".pdf.64", function (error, stdout, stderr) {
        if (error !== null) {
            log('Error writing out base64: ' + error, job);
            log('stdout: ' + stdout, job);
            log('stderr: ' + stderr, job);
        }
        else {
            //Now the encoded file is itself encoded in UTF-8, which we'll send up to GitHub
            //When that call completes we'll update the array of keynote files, popping this one off the stack
            var b64data = fs.readFileSync(path + ".pdf.64", "UTF-8");
            job.github.gitdata.createBlob({
                owner: job.config.owner,
                repo: job.config.targetRepo,
                content: b64data,
                encoding: "base64"
            })
                .then(function (err, res) {
                    //Pop the completed keynote from the array of keynotes, and add the completed PDF to the list of
                    //PDFs
                    updateKeynoteFileList(err, keynote, job)
                })
                .catch(function (err, res) {
                    log("Error creating BLOB for " + path + ": " + err.message, job);
                });
        }
    });
}

//callback to keep track of when files are successfully converted and their new blobs successfully created.
//As keynotes are converted and their blobs created and uploaded to GitHub, we call here to remove the file from the
// keynoteFiles array.  When the array is empty, proceed with building the new tree

function updateKeynoteFileList(blob, keynote, job) {
    log("New blob created: " + blob.sha + " for keynote " + keynote.path, job);


    //push the new PDF blob onto our array of PDFs.  This will become the 'tree' element of our new Git tree later
    job.PDFs.push({
        path: keynote.path + ".pdf",
        type: "blob",
        mode: "100644",
        sha: blob.sha,
        url: "https://api.github.com/repos/bryancross/testrepo/git/blobs/" + blob.sha
    })

    //Remove the keynote from the array of keynotes to process.  When the array is empty we'll move on to creating the new tree, commit and updating refs.
    for (var i = 0; i < job.keynoteFiles.length; i++) {
        if (job.keynoteFiles[i].sha === keynote.sha) {
            job.keynoteFiles.splice(i, 1);
        }
    }

    //Have we retrieved and converted all the keynotes? If so then it's time to create our new tree
    if (job.keynoteFiles.length === 0) {
        log("All keynotes converted and new blobs created", job);
        createNewTree(job);
    }
}

function createNewTree(job) {
    log("Creating new tree...", job);

    //Get the latest commit and tree.  We are doing this again in case there were any commits between the time we first retrieved the commit and now.
    //We want to be sure we're using the latest commit as our parent.  This is actually a shortcoming in this approach, as there's no way to _completely_
    //mitigate this risk.
    log("Fetching latest commit", job);
    job.github.repos.getBranch({
        owner: job.config.owner,
        repo: job.config.targetRepo,
        branch: job.config.targetBranch
    }).then(function (err, res) {
        var curCommit = err.commit;
        log("Current commit SHA: " + curCommit.sha, job);
        log("Fetching current tree", job);
        job.github.gitdata.getTree({
            owner: job.config.owner,
            repo: job.config.targetRepo,
            sha: curCommit.sha,
            recursive: true
        }).then(function (err, res) {

            var curCommitTree = err;
            log("Current tree SHA: " + curCommitTree.sha, job);

            //Start with a clean tree
            log("Deleting TREE");
            delete curCommitTree.tree;

            //Only commit the PDFs
            curCommitTree.tree = job.PDFs;

            //Create the tree, then create a new commit with the tree, then update the HEAD ref for the targetBranch
            //with the new commit, then cleanup and end
            job.github.gitdata.createTree({
                owner: job.config.owner,
                repo: job.config.targetRepo,
                tree: curCommitTree.tree,
                base_tree: curCommitTree.sha
            })
                .then(function (err, res) {
                    log("Creating new commit for tree: " + err.sha, job);
                    //Create the new commit object using the provided tree and parent commit SHA.
                    job.github.gitdata.createCommit({
                        owner: job.config.owner,
                        repo: job.config.targetRepo,
                        message: job.config.commitMsg,
                        tree: err.sha,
                        parents: [curCommit.sha]
                    })
                        .then(function (err, res) {
                            log("Updating references for new commit: " + err.sha, job);
                            //Update our branch HEAD to point to our new commit

                            job.github.gitdata.updateReference({
                                owner: job.config.owner,
                                repo: job.config.targetRepo,
                                ref: "heads/" + job.config.targetBranch,
                                sha: err.sha
                            })
                                .then(function (err, res) {
                                    log("HEAD ref for branch " + job.config.targetBranch + " updated: " + err.object.sha, job, "Success");
                                    //Cleanup by deleting the temp directory and exit
                                    cleanup(job);
                                })
                                .catch(function (err, res) {
                                        //The only error I've seen is when commits get out of order (not a fast-forward commit)
                                        //The fix is just to try it again.
                                        //Need to add logic to examine the err object
                                    console.log("Its an error!")
                                    log("Fast-forward error, commit conflict", job, "Retrying commit", err);
                                        createNewTree(job);
                                    }
                                )
                        })
                })
        })
    });

}

function cleanup(job)
{
    if (job.config.deleteTempDir) {
        /*
         rimraf didn't work, so we'll use the shell....

         var rmdir = require('rimraf');
         rmdir(job.tempDir, null,function(err) {
         log("Error deleting temp directory. " + err.foo, job);
         });
         */
        exec("rm -rf " + job.tempDir, function (error, stdout, stderr) {
            if (error !== null) {
                log('Error writing out base64: ' + error, job);
                log('stdout: ' + stdout, job);
                log('stderr: ' + stderr, job);
            }
            else {
                log("Temporary directory deleted", job);
            }
        })
    }

    job.endTime = format(new Date());
    job.duration = differenceInMilliseconds(parse(job.endTime), parse(job.StartTime)) / 1000;

    //Clean up the log by deleting redundant/unnecessary nodes from the job object
    delete job.keynoteFiles;
    delete job.github;

    //write out log file
    fs.writeFile('./log/' + job.jobID + ".json", JSON.stringify(job));

    //pop the job off the job stack, so it doesn't grow to consume the world
    //Occasionally fails for reasons unknown, so we'll leave it off.

    //for(var i = 0; i < global.jobs.length; i++)
    // {
//        if(global.jobs[i].jobID === job.jobID)
 //       {
 //           delete global.jobs[i];
  //      }
  //  }

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
            'Content-Type': 'application/json',
        }
    };

    var req = http.request(options, function(res)
    {
        console.log('Status: ' + res.statusCode);
        console.log('Headers: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (body) {
            //log('Body: ' + body);
        });
    });
    req.on('error', function(e) {
        log('Error executing callback: ' + e.message);
    });
// write data to request body
    req.write(JSON.stringify(job));
    req.end();
    log("Callback executed");

}

function log(msg, job, status, error) {
    var datestamp = format(new Date());
    var entry = {"time": datestamp, "msg": ":     " + msg}

    if(job)
    {
        if(status)
        {
            job.status = status;
        }
        job.msgs.push({"time": datestamp, "msg": msg});
        if(error)
        {
            job.errorMessage = err.message;
            job.errors.push(err.message);
        }
    }
    console.log(datestamp + ":    " + msg);

}




