const fs = require('fs');

// We have jimp or canvas or we can check with Jimp if installed, or we can just read the image
console.log('Searching for image libraries...');
try {
  require.resolve('jimp');
  console.log('jimp found');
} catch (e) {
  console.log('jimp not found');
}
