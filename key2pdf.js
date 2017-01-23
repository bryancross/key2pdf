/**
 * Created by bryancross on 12/27/16.
 *
 */

"use strict";
var logger = require('./lib/logger.js');
var catalog = require('./lib/catalog');
var cleanup = require('./lib/cleanup');
var arrayUtil = require('./lib/arrayUtil.js');
var b64 = require('js-base64').Base64;
var crypto = require('crypto');
var exec = require('child_process').exec;
var GitHubClient = require("github"); //https://github.com/mikedeboer/node-github
var globalJobTemplate = require("./config/job-template.json");
var fs = require('fs');
var http = require('http');
var HttpDispatcher = require('httpdispatcher');
var dispatcher     = new HttpDispatcher();
const PORT = 3000;
var parse = require('date-fns/parse');  //https://github.com/date-fns/date-fns
var format = require('date-fns/format');  //https://github.com/date-fns/date-fns
var differenceInMilliseconds = require('date-fns/difference_in_milliseconds'); //https://github.com/date-fns/date-fns
var jobs = [];



//GitHub Enterprise uses /api/v3 as a prefix to REST calls, while GitHub.com does not.
globalJobTemplate.pathPrefix = (globalJobTemplate.targetHost !== "github.com") ? "/api/v3" : "";

//If we're going to GitHub, prepend the host with 'api', otherwise leave it be
globalJobTemplate.targetHost = (globalJobTemplate.targetHost === "github.com") ? "api.github.com" : globalJobTemplate.targetHost;

//Dispatch request, send response
function dispatchRequest(request, response)
{
    try {
        //Dispatch
        dispatcher.dispatch(request, response);

    }
    catch (e) {
        logger.log(e)
    }
}



//Create a server
var server = http.createServer(dispatchRequest);

//Startup the server
server.listen(globalJobTemplate.listenOnPort == null ? PORT : globalJobTemplate.listenOnPort, function () {
    //Callback when server is successfully listening
    logger.log("Server listening on: http://localhost: " + PORT);
});

//handle a call to /status.  Find the job in jobs, or if it isn't in the array find the log directory, and
//return the job log data.
dispatcher.onPost('/status', function (req, res) {
    var jobID = JSON.parse(req.body).jobID;

    ///Search the array of jobs in memory
    var id = arrayUtil.findValueInArray(jobs, jobID, "jobID");
    if (id || id === 0) {
        var status = JSON.parse(JSON.stringify(jobs[id]));

        //Delete the github object, since it is 1000s of lines long
        status.delete("github");
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify(status));
        return;
    }
    //If we're still here the job is finished and the job object deleted from the global array
    //So let's see if there's info in the log...
    try
    {
        var logData = fs.readFileSync('./log/' + jobID + '.json', "UTF-8");
        logData = JSON.stringify(logData);
        res.end(logData);
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
    }
});


//Replace any global config parameter with parameters
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


dispatcher.onPost('/pushhook', function (req, res) {

var commit = JSON.parse(req.body);
var commitIndex = arrayUtil.findValueBetweenArrays(jobs, commit.head_commit.id, "commitSHA","id");

    if(commitIndex || commitIndex === 0)
{
    logger.log("Ignoring push event: " + commit.commits[commitIndex.array2index].id);
    commit.commits.splice(commitIndex.array2index,1);
}

//Are there any commits left?
    if (commit.commits.length === 0)
    {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify({msg: "Pushhook event ignored: ", commitID: commit.head_commit.id}));
        logger.log("Ignoring pushhook event");
        return;
    }
    //If there are no added or modified files, exit
    //We still need to deal with removed files...
    else if (commit.head_commit.added.length === 0 && commit.head_commit.modified.length === 0)
    {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify({msg: "Pushhook event received, no added or modified files: ", commitID: commit.head_commit.id}));
        logger.log("Ignoring pushhook event, no added or modified files.");
        return;
    }

//Determine if there are any keynotes
//If not exit

var numKeynoteFiles = 0;
    for(var add = 0; add < commit.head_commit.added.length;add++)
    {
            if(commit.head_commit.added[add].endsWith(".key"))
            {
                numKeynoteFiles++;
                break;
            }
    };

    for(var add = 0; add < commit.head_commit.modified.length;add++)
    {
        if(commit.head_commit.modified[add].endsWith(".key"))
        {
            numKeynoteFiles++;
            break;
        }
    };

    if(!numKeynoteFiles)
    {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify({msg: "Pushhook event received, no keynotes: ", commitID: commit.head_commit.id}));
        logger.log("Ignoring pushhook event, no keynotes." + commit.head_commit.id);
        return;
    }

        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(JSON.stringify({msg: "Pushhook event received: ", commitID: commit.head_commit.id}));
        logger.log("Processing pushhook for commit: " + commit.head_commit.id);


    //If there are, start the process

        var job = initJob();
        job.config.targetBranch = commit.ref.split('/')[2];
        job.config.targetHost = commit.repository.url.split('/')[2];
        job.config.targetRepo =  commit.repository.name;
        job.config.owner = commit.repository.owner.name;
        job.config.commitTreeSHA =  commit.head_commit.tree_id;
        job.config.pushCommit = commit;
        job.requestType = "pushhook";
        job.requestID = commit.head_commit.id;

        if(job.config.pushCommit.head_commit.added.length > 0 || job.config.pushCommit.head_commit.modified.length > 0)
        {
            convertFilesForCommit(job);
        }
        //Deal with these later
        /*
        for(var rem = 0; rem < job.config.commit.head_commit.removed.length; rem++)
        {

        }
        */

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

    var job = initJob();
    job.logger = logger;
    if (req.body === "")
    {
        res.writeHead(406, {'Content-Type': 'text/plain'});
        res.end('No parameters found in request');
    }
    else {
        try {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end(JSON.stringify({msg: "Conversion request received", jobID: job.jobID}));
            var params = JSON.parse(req.body);
            //update the config object with any parameters passed in.  Generally just the URL
            updateConfigFromParams(params, job);
            job.requestType = 'url';
            job.requestID = params.url;
            logger.log("Path: " + job.config.filePath, job, "Processing");
            //All is well, let's go convert!
            //We pass the job object around to preserve state and specific configuration data for each request
            //Another approach would be to create an object for each job, but this approach works just as well
            convertFilesForBranch(job);
            //convertFiles(job);
        }
        catch (err) {
            res.writeHead(406, {'Content-Type': 'text/plain'});
            res.end('Error initializing' + err.message);
            logger.log("Error initializing: " + err.message, job, "Failed", err);
            cleanup(job);
        }
    }
});

//setup the job from the template in ./config/job-template.json
function initJob()
{
    var job = JSON.parse(JSON.stringify(globalJobTemplate));

//Attach the new client to the job objects
    job.startTime = format(new Date());
    //Assign a (hopefully) unique ID
    job.jobID = crypto.randomBytes(20).toString('hex');
    job.keynoteFiles = [];

    //  Create a github client using the node-github API https://github.com/mikedeboer/node-github
    var github = new GitHubClient({
        debug: job.config.debug,
        pathPrefix: job.config.pathPrefix
    });

    //Create an auth object using configured values.  Will be used to authenticate the GitHub client
    var auth = {
        type: job.config.authType
        , token: job.config.GitHubPAT
        , username: job.config.user
    };

    //authenticate using configured credentials
    github.authenticate(auth);

    //attach the client to the job object
    job.github = github;
    jobs.push(job);
    return job;
}

function createTempDir(job)
{
    var mkdirp = require('mkdirp'); //https://www.npmjs.com/package/mkdirp
    //Push the temp dir path onto the job object for use later
    job.tempDir = './job/' + job.jobID;
    //Use mkdirp to safely create the temp directory
    mkdirp(job.tempDir, function (err) {
        if (err != null) {
            logger.log("Fatal error creating temp directory: " + err.message, job, "Failed", err);
            cleanup(job);
        }

    });

    logger.log("Temp directory: " + job.tempDir, job);

}

function convertFilesForCommit(job)
{
    //Basically the same thing as convert files, but starting one step later in the process since we already
    //have a commit.  No need to call getBranch()

    //Get the tree for the commit

    var newTree = [];

    //create temp dir
    createTempDir(job);

    job.github.gitdata.getTree({
        owner: job.config.owner,
        repo: job.config.targetRepo,
        sha: job.config.pushCommit.head_commit.id,
        recursive:true})
        .then(function(err,res)
        {
            newTree = err.tree;
            getFiles(newTree, job);
        })
}

//Get the current branch, then get the tree, then download all the keynotes contained in the tree
//Basically the same as convertFilesForCommit, but starting out with a branch instead of a commit object, so
//we have to get the latest commit for the specified branch.
//Also, since this is being called in a /convert scenario, do some filtering if the call to /convert specifies a single file
//FYI: It seems like the err, res are in the wrong order in in all node-github API calls.  So, even though it's weird to be using the err object, it matches the pattern
//in the API documentation

function convertFilesForBranch(job) {

    var tree = [];
    //create a temp directory.
    createTempDir(job);
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
            if (!job.config.filePath)
            {
                logger.log("Processing all files in repository: " + job.config.targetRepo, job);
                //send the entire tree over to getFiles
                tree = err.tree;
            }
            else {
                var treeIndex = arrayUtil.findValueInArray(err.tree,job.config.filePath, "path");
                if(treeIndex || treeIndex === 0)
                {
//                for (var i = 0; i < err.tree.length; i++) {
//                    if (err.tree[i].path === job.config.filePath) {
                        //create a tree for our single file
                        tree.push(err.tree[treeIndex]);
                        logger.log("Processing single file: " + tree[0].path, job);
//                        break;
//                    }
                }
            }
                //If a single file was specified and not found
                if (tree.length === 0 && job.config.hasOwnProperty("filePath"))
                {
                    logger.log("No file found in repository for path: " + job.config.filePath, job, "Failed", {msg:"No file found in repository for path: " + job.config.filePath});
                    cleanup(job);
                    return;
                }
                //otherwise go get the files
                getFiles(tree, job);

        })
        //This catch block is never called, apparently, in the case of a failed GitHub API call, e.g.,
        //bad credentials.  I really feel like it should be...
            .catch(function (err) {
                logger.log("Error in convertFiles: " + err.message, job, "Failed", err);
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
    var keynotesFound = false;

    for (var i = 0; i < tree.length; i++) {
        curItem = tree[i];
        //look for files matching *.key....
        if ((/\.(key)$/i).test(curItem.path))
        {
            //Found one!
            keynotesFound = true;
            //Download the file
            //If we're working from a commit, filter out all but the files changed in the commit
            if(job.config.hasOwnProperty("pushCommit"))
            {
                var addedIndex = arrayUtil.findValueInArray(job.config.pushCommit.head_commit.added,curItem.path);
                if(addedIndex || addedIndex === 0)
                {
                    job.keynoteFiles.push(curItem);
                    job.files.push(curItem);
                    downloadKeynote(curItem, job);
                    break;
                }
                var modifiedIndex = arrayUtil.findValueInArray(job.config.pushCommit.head_commit.modified, curItem.path);
                if(modifiedIndex || modifiedIndex === 0)
                {
                    job.keynoteFiles.push(curItem);
                    job.files.push(curItem);
                    downloadKeynote(curItem, job);
                    break;
                }
            }
            else
            {
                job.keynoteFiles.push(curItem);
                job.files.push(curItem);
                downloadKeynote(curItem,job);
            }
        }
    }
    if(!keynotesFound)
    {
        logger.log("No keynote files found", job, "Complete");
        cleanup(job);
    }
}

function downloadKeynote(keynote, job) {
    var path = job.tempDir + "/" + keynote.path.substr(keynote.path.lastIndexOf("/") + 1);

    //Remove illegal characters from path
    path = path.replace(/ /g,"_");

    logger.log("Beginning content download for: " + keynote.path + " (" + keynote.sha + ")", job);
    //Use the gitdata API to download the blob to our temporary directory
    //Async call, so use promises to pipe result to the convertKeynote function
    job.github.gitdata.getBlob({owner: job.config.owner, repo: job.config.targetRepo, sha: keynote.sha})
        .then(function (err, res) {
            // Content is delivered by the GitHub API as base64 encoded text
            // Write the content to the temp directory, base64 decoding it along the way
            fs.writeFile(path, new Buffer(err.content, "base64"), function (error) {
                if (error) {
                    //Probably should do something more useful here
                    logger.log("Error downloading file: " + error.message, job, "File download failed", error);
                }
                //update the user
                logger.log("Content downloaded for: " + keynote.path + " (" + keynote.sha + ")", job);
                //send the file for conversion
                convertKeynote(keynote, path, job);
            })
        })
}

function convertKeynote(keynote, path, job) {
    logger.log("Converting " + keynote.path + " to PDF via CloudConvert", job);
    path.replace(" ","_");
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
        logger.log("Conversion of " +keynote.path + " complete", job);
    createNewBlobFromFile(path, keynote, job);
                    })
        .on('error', function(err) {

        logger.log("Conversion of " +keynote.path + " failed", job, "Conversion failure for: " +path);
        //Retry.  Need to figure out a way to limit this...
        if(job.hasOwnProperty("retry" + keynote.sha))
        {
            job["retry" + keynote.sha] = job["retry" + keynote.sha] + 1;
            if(job["retry" + keynote.sha] >= job.config.maxConvertRetries)
            {
                logger.log("Maximum number of conversion retries exceeded: " + path, job, "Conversion failure");
                var keyIndex = arrayUtil.findValueInArray(job.keynoteFiles,keynote.sha, "sha");
                if(keyIndex || keyIndex === 0)
                    {
                       job.keynoteFiles.splice(key,1);
                    }
            }
        }
        else
        {
            job["retry" + keynote.sha] = 1;
            convertKeynote(keynote, path, job);
        }
})
}
function createNewBlobFromFile(path, keynote, job) {

    logger.log("Creating new Blob for " + keynote.path + ".pdf", job);
    path.replace(" ","_");
    //Could not figure out a native node/JS solution for this.  The documented functions didn't work
    //So, we just use the shell tools to base 64 encode the PDF file.
    exec("base64 -i " + path + ".pdf" + " -o " + path + ".pdf.64", function (error, stdout, stderr) {
        if (error !== null) {
            logger.log('Error writing out base64: ' + error, job);
            logger.log('stdout: ' + stdout, job);
            logger.log('stderr: ' + stderr, job);
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
                    logger.log("Error creating BLOB for " + path + ": " + err.message, job);
                });
        }
    });
}

// callback to keep track of when files are successfully converted and their new blobs successfully created.
// As keynotes are converted and their blobs created and uploaded to GitHub, we call here to remove the file from the
// keynoteFiles array.  When the array is empty, proceed with building the new tree

function updateKeynoteFileList(blob, keynote, job) {
    logger.log("New blob created: " + blob.sha + " for keynote " + keynote.path, job);

    //push the new PDF blob onto our array of PDFs.  This will become the 'tree' element of our new Git tree later
    job.PDFs.push({
        path: keynote.path + ".pdf",
        type: "blob",
        mode: "100644",
        sha: blob.sha,
        url: "https://" + job.config.targetHost + "/repos/" + job.config.owner + "/" + job.config.targetRepo + "/git/blobs/" + blob.sha
    });

    //Remove the keynote from the array of keynotes to process.  When the array is empty we'll move on to creating the new tree, commit and updating refs.
    var keyIndex = arrayUtil.findValueInArray(job.keynoteFiles,keynote.sha, "sha")
    if(keyIndex || keyIndex === 0)
    {
        job.keynoteFiles.splice(keyIndex, 1);
    }
    else
    {
        console.logger.log("foo");
    }

    //Have we retrieved and converted all the keynotes? If so then it's time to create our new tree
    if (job.keynoteFiles.length === 0) {
        logger.log("All keynotes converted and new blobs created", job);
        createNewTree(job);
    }
}

function createNewTree(job) {
    logger.log("Creating new tree...", job);

    //Get the latest commit and tree.  We are doing this again in case there were any commits between the time we first retrieved the commit and now.
    //We want to be sure we're using the latest commit as our parent.  This is actually a shortcoming in this approach, as there's no way to _completely_
    //mitigate this risk.
    logger.log("Fetching latest commit", job);
    job.github.repos.getBranch({
        owner: job.config.owner,
        repo: job.config.targetRepo,
        branch: job.config.targetBranch
    }).then(function (err, res) {
        var curCommit = err.commit;
        logger.log("Current commit SHA: " + curCommit.sha, job);
        logger.log("Fetching current tree", job);
        job.github.gitdata.getTree({
            owner: job.config.owner,
            repo: job.config.targetRepo,
            sha: curCommit.sha,
            recursive: true
        }).then(function (err, res) {

            var curCommitTree = err;
            logger.log("Current tree SHA: " + curCommitTree.sha, job);

            //Start with a clean tree
            logger.log("Deleting TREE");
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
                    logger.log("Creating new commit for tree: " + err.sha, job);
                    //Create the new commit object using the provided tree and parent commit SHA.
                    job.github.gitdata.createCommit({
                        owner: job.config.owner,
                        repo: job.config.targetRepo,
                        message: job.config.commitMsg,
                        tree: err.sha,
                        parents: [curCommit.sha]
                    })
                        .then(function (err, res) {
                            logger.log("Updating references for new commit: " + err.sha, job);

                            //Put the commit SHA on the job object so we can filter this commit out
                            //when we receive the webhook push event

                            job.newCommitSHA = err.sha;
                            job.newCommit = err;
                            //Update our branch HEAD to point to our new commit
                            job.github.gitdata.updateReference({
                                owner: job.config.owner,
                                repo: job.config.targetRepo,
                                ref: "heads/" + job.config.targetBranch,
                                sha: err.sha
                            })
                                .then(function (err, res) {
                                    logger.log("HEAD ref for branch " + job.config.targetBranch + " updated: " + err.object.sha, job, "Success");
                                    //Cleanup by deleting the temp directory and exit
                                    //update the catalog.  Gotta make this asynch...
                                    updateCatalog(job, function(job){cleanup(job)});


                                })
                                .catch(function (err, res) {
                                        //The only error I've seen is when commits get out of order (not a fast-forward commit)
                                        //The fix is just to try it again.
                                        //Need to add logic to examine the err object
                                    if(typeof err != 'undefined')
                                    {
                                        logger.log("Fast-forward error, commit conflict", job, "Retrying commit", err);
                                    }
                                    else
                                    {
                                        logger.log("Unknown error in create new tree", job, "Retrying commit");
                                    }
                                        createNewTree(job);
                                    }
                                )
                        })
                })
        })
    });

}

function cleanup(job) {
    cleanup.cleanup(job);
    return;
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

}

/*
function log(msg, job, status, error) {
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
    console.logger.log(datestamp + ":    " + msg);

}

*/
function updateCatalog(job) {
    catalog.updateCatalog(job, cleanup);
    return;
    job.github.repos.getContent({
            owner: job.config.owner,
            repo: job.config.targetRepo,
            path: "keynote-catalog.json"
        }
    ).then(function (err, res) {
        logger.log("Got keynote-catalog.json: " + err.sha, job);
        var cat = b64.decode(err.content);
        job.catalog = JSON.parse(cat);
        job.catalog.sha = err.sha;
        updateJSONCatalog(job);
    }).catch(function (err) {
        logger.log("error downloading keynote-catalog.json",job,"Updating catalog", err);
        job.catalog = [];
        job.catalog.sha = "";
        updateJSONCatalog(job);
    })
}

function updateJSONCatalog(job) {
    var catEntry = null;
    if(job.catalog.sha === "")
    {
        job.catalog = new Array();
    }
    job.files.forEach(function (keynote) {
        var index = arrayUtil.findValueInArray(job.catalog, keynote.path, "path");
        //Make a new entry
        if (!index && index != 0) {
            catEntry = new Object();
            //catEntry = require("../config/catalog-entry-template.json");
            catEntry.path = keynote.path;
            catEntry.bloburl = keynote.url
            catEntry.sha = keynote.sha;
            catEntry.size = keynote.size;
            catEntry.url = "https://" + (job.config.targetHost != 'api.github.com' ? job.config.targetHost : job.config.targetHost.substring(4)) + "/" + job.config.owner + "/" + job.config.targetRepo + "/blob/" + job.config.targetBranch + "/" + keynote.path
            catEntry.PDFurl = catEntry.url + ".pdf"
            catEntry.committer = typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.name : job.config.pushCommit.head_commit.author.username;
            catEntry.commitDate = typeof job.config.pushCommit === 'undefined' ? job.newCommit.committer.date : job.config.pushCommit.head_commit.timestamp;
            catEntry.originalCommitMsg = typeof job.config.pushCommit === 'undefined' ? job.newCommit.message : job.config.pushCommit.head_commit.message;
            catEntry.commitMessages = [{commitDate:catEntry.commitDate,committer:catEntry.committer,msg:catEntry.originalCommitMsg}];
            job.catalog.push(catEntry);
        }
        else
        //Add commit message to existing entry
        {
            job.catalog[index].size = keynote.size;
            job.catalog[index].sha = keynote.sha
            job.catalog[index].updatedBy = typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.name : job.config.pushCommit.head_commit.author.username ;
            job.catalog[index].updated = typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.date : job.config.pushCommit.head_commit.timestamp;
            job.catalog[index].commitMessages.push({
                commitDate: typeof job.config.pushCommit === 'undefined' ? job.newCommit.committer.date : job.config.pushCommit.head_commit.timestamp
                , committer: typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.name : job.config.pushCommit.head_commit.author.username
                , msg: typeof job.config.pushCommit === 'undefined' ? job.newCommit.message : job.config.pushCommit.head_commit.message
            })
        }
    })
    var catContent = b64.encode(JSON.stringify(job.catalog));
    if(typeof job.catalog.sha === 'undefined' || job.catalog.sha === "")
    {

        job.github.repos.createFile({owner:job.config.owner,repo:job.config.targetRepo,path:"keynote-catalog.json",message:job.config.commitMsg,content:catContent})
            .then(function(err, res)
            {
                updateMarkdownCatalog(job);
            })
    }
    else
    {
        job.github.repos.updateFile({owner:job.config.owner, repo:job.config.targetRepo, path:"keynote-catalog.json",message:job.config.commitMsg,content:catContent,sha:job.catalog.sha})
            .then(function(err,res)
            {
                updateMarkdownCatalog(job);
            })
    }

}

function updateMarkdownCatalog(job)
{
    var output = "";
    job.catalog.forEach(function(cat)
    {
        output = output + "### [" + cat.path + "](" + cat.url + ")\n" ;
        output = output + "#### [PDF rendition](" + cat.PDFurl + ")\n";
        output = output + "|        |        |\n";
        output = output + "|--------|--------|\n";
        output = output + "|**Author:**|" + cat.committer + "|\n";
        output = output + "|**Date:**|" + cat.commitDate + "|\n";
        output = output + "|**Size:**|" + (cat.size/1024/1024).toString().split(".")[0] + "." + (cat.size/1024/1024).toString().split(".")[1].substring(1,2) + " MB|\n";
        output = output + "|**Updated:**|" + (typeof cat.updated != 'undefined' ? cat.updated : "|\n");
        output = output + "|**Updated By:**|" + (typeof cat.updater != 'undefined' ? cat.updater : "|\n");
        output = output + "|**Description:**|" + cat.originalCommitMsg + "\n";
        output = output + "\n";
        output = output + "##### Updates:\n";
        output = output + "| Date  | Committer | Description |\n";
        output = output + "|-------|-----------|-------------|\n"

        cat.commitMessages.forEach(function(msg)
        {
            output = output + "|" + msg.commitDate + "|";
            output = output + msg.committer + "|";
            output = output + msg.msg + "|\n";
        });
    });
    job.markdownCatalog = output;
    uploadCatalog(job)
}

function uploadCatalog(job)
{
    var b64content = b64.encode(job.markdownCatalog)
    job.github.repos.getContent({owner:job.config.owner,
        repo:job.config.targetRepo,
        path:"keynote-catalog.md"}
    ).then(function(err,res){
        logger.log("Found Markdown Catalog" + err.sha, job);

        job.github.repos.updateFile({owner:job.config.owner, repo:job.config.targetRepo, path:"keynote-catalog.md",message:job.config.commitMsg,content:b64content,sha:err.sha})
            .then(function(err,res)
            {
                logger.log("Markdown catalog updated", job,"Finishing");
                delete job.catalog;
                delete job.markdownCatalog;
                cleanup(job);
            })
    }).catch(function(err){
        job.github.repos.createFile({owner:job.config.owner,repo:job.config.targetRepo,path:"keynote-catalog.md",message:job.config.commitMsg,content:b64content})
            .then(function(err,res)
            {
                logger.log("Markdown catalog uploaded", job,"Finishing");
                delete job.catalog;
                delete job.markdownCatalog;
                cleanup(job);
            })

    })
}
