export function aggregateDashboard(results, sys) {
  const now = Date.now();
  const offlineThresMs = parseInt(sys.offline_threshold || '30') * 1000;

  let globalOnline = 0; let globalOffline = 0;
  let globalSpeedIn = 0; let globalSpeedOut = 0;
  let globalNetTx = 0; let globalNetRx = 0;

  let visibleAsset = 0; let visibleRemAsset = 0;
  let visibleServersCount = 0;

  const groups = {};
  const countryStats = {};

  if (results && results.length > 0) {
    for (const server of results) {
      let amount = 0; let remValue = 0;
      if (server.price && server.price.match(/[\d.]+/)) {
        let rawAmount = parseFloat(server.price.match(/[\d.]+/)[0]) || 0;
        let rate = 1;
        const pUpper = server.price.toUpperCase();
        if (pUpper.includes('USD') || pUpper.includes('$')) rate = 7.23;
        else if (pUpper.includes('EUR') || pUpper.includes('€')) rate = 7.85;
        else if (pUpper.includes('GBP') || pUpper.includes('£')) rate = 9.12;
        else if (pUpper.includes('HKD')) rate = 0.92;
        else if (pUpper.includes('JPY')) rate = 0.048;
        else if (pUpper.includes('TWD')) rate = 0.22;
        else if (pUpper.includes('RUB')) rate = 0.078;
        else if (pUpper.includes('CAD')) rate = 5.25;
        else if (pUpper.includes('AUD')) rate = 4.75;
        amount = rawAmount * rate;

        let cycleDays = 365;
        const priceStr = server.price.toLowerCase();
        if (priceStr.includes('月') || priceStr.includes('mo') || priceStr.includes('month')) cycleDays = 30;
        else if (priceStr.includes('季') || priceStr.includes('qu')) cycleDays = 90;
        else if (priceStr.includes('半年') || priceStr.includes('half')) cycleDays = 180;
        else if (priceStr.includes('天') || priceStr.includes('day')) cycleDays = 1;

        let expDays = -1;
        if (server.expire_date) {
          const expTime = new Date(server.expire_date).getTime();
          if (!isNaN(expTime)) {
            const diff = expTime - now;
            expDays = diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) : 0;
          }
        }
        remValue = expDays === -1 ? amount : (amount / cycleDays) * expDays;
      }

      if (server.is_hidden === 'true') continue;

      visibleServersCount++;
      visibleAsset += amount;
      visibleRemAsset += remValue;
      server._remValue = remValue;
      server._amount = amount;

      const isOnline = (now - server.last_updated) < offlineThresMs;
      if (isOnline) {
        globalOnline++;
        globalSpeedIn += parseFloat(server.net_in_speed) || 0;
        globalSpeedOut += parseFloat(server.net_out_speed) || 0;
      } else { globalOffline++; }

      const rx_val = sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_rx || 0) : parseFloat(server.net_rx || 0);
      const tx_val = sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_tx || 0) : parseFloat(server.net_tx || 0);
      globalNetTx += tx_val; globalNetRx += rx_val;

      const grpName = server.server_group || '默认分组';
      if (!groups[grpName]) groups[grpName] = [];
      groups[grpName].push(server);

      let cCodeMap = (server.country || 'xx').toUpperCase();
      if (cCodeMap === 'TW') cCodeMap = 'CN';
      if (cCodeMap !== 'XX') countryStats[cCodeMap] = (countryStats[cCodeMap] || 0) + 1;
    }
  }
  return { now, offlineThresMs, globalOnline, globalOffline, globalSpeedIn, globalSpeedOut, globalNetTx, globalNetRx, visibleAsset, visibleRemAsset, visibleServersCount, groups, countryStats };
}
