function uploadTextFile(auth) {
  var service = google.drive({ version: 'v3', auth: auth });
  service.files.create({
    resource: {
      name: 'Test',
      mimeType: 'text/plain'
    },
    media: {
      mimeType: 'text/plain',
      body: 'Hello from NodeJS!'
    }
  }, function (err, response) {
    if (err) {
      console.log('Error from API: \n', err);
      return;
    } else {
      console.log('Response: ', response);
    }
  });
}

module.exports = uploadTextFile;
