const { ndown } = require('nayan-media-downloader');
async function test() {
  try {
    const res = await ndown('https://www.instagram.com/p/DZPnlwEv80S/');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err.message);
  }
}
test();
