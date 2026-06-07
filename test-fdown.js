const axios = require('axios');
axios.post('https://fdown.net/download.php', 'URLz=https://www.facebook.com/share/v/1DeVgMbGRL/', {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0'
  }
}).then(r => {
  console.log(r.status);
  const m1 = r.data.match(/id="sdlink"\s+href="([^"]+)"/);
  const m2 = r.data.match(/id="hdlink"\s+href="([^"]+)"/);
  console.log('SD:', m1 ? m1[1].substring(0, 50) : null);
  console.log('HD:', m2 ? m2[1].substring(0, 50) : null);
}).catch(e => console.log(e.message));
