export function renderDashboardScript() {
  return `        <script>
          const formatBytesJs = (bytes) => {
            const b = parseInt(bytes);
            if (isNaN(b) || b === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(b) / Math.log(k));
            return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          };

          window.speedCache = {};
          function animateBytes(el, start, end, duration) {
              let startTimestamp = null;
              const step = (timestamp) => {
                  if (!startTimestamp) startTimestamp = timestamp;
                  const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                  const easeProgress = 1 - Math.pow(1 - progress, 3);
                  const currentBytes = start + (end - start) * easeProgress;
                  el.innerText = formatBytesJs(currentBytes) + '/s';
                  if (progress < 1) window.requestAnimationFrame(step);
              };
              window.requestAnimationFrame(step);
          }

          function applySpeedAnimations() {
              document.querySelectorAll('.speed-anim').forEach(el => {
                  const id = el.dataset.id;
                  const newVal = parseFloat(el.dataset.val) || 0;
                  const oldVal = window.speedCache[id] !== undefined ? window.speedCache[id] : 0;
                  window.speedCache[id] = newVal;
                  if (oldVal !== newVal) { animateBytes(el, oldVal, newVal, 1200); } 
                  else { el.innerText = formatBytesJs(newVal) + '/s'; }
              });
          }

          let mapInitialized = false;
          window.currentFilter = 'all';

          function switchView(viewName) {
            document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('btn-' + viewName).classList.add('active');
            
            document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById('view-' + viewName).classList.add('active');
            
            localStorage.setItem('monitor_preferred_view', viewName);

            if (viewName === 'map') {
              if (!mapInitialized) { initMap(); mapInitialized = true; } 
              else { window.myMap.invalidateSize(); }
            }
          }

          function setFilter(code) {
              window.currentFilter = code; applyFilter();
          }

          function applyFilter() {
              if(!window.currentFilter) window.currentFilter = 'all';
              document.querySelectorAll('.filter-tag').forEach(el => {
                  if (el.dataset.code === window.currentFilter) el.classList.add('active'); else el.classList.remove('active');
              });
              document.querySelectorAll('.vps-card').forEach(el => {
                  if (window.currentFilter === 'all' || el.dataset.country === window.currentFilter) el.style.display = 'flex';
                  else el.style.display = 'none';
              });
              document.querySelectorAll('#ajax-table tr').forEach(el => {
                  if (window.currentFilter === 'all' || el.dataset.country === window.currentFilter) el.style.display = '';
                  else el.style.display = 'none';
              });
              document.querySelectorAll('.group-header').forEach(header => {
                  const grid = header.nextElementSibling;
                  if (grid && grid.classList.contains('grid-container')) {
                      const visibleCards = Array.from(grid.querySelectorAll('.vps-card')).filter(el => el.style.display !== 'none');
                      header.style.display = visibleCards.length > 0 ? 'block' : 'none';
                  }
              });
          }

          let markersLayer; let geoJsonLayer; let sarLayer; let worldGeoJson = null; let currentMapDataStr = "";

          const countryCoords = {
            'US': [37.09, -95.71], 'CN': [35.86, 104.19], 'JP': [36.20, 138.25], 'HK': [22.31, 114.16], 'SG': [1.35, 103.81], 'KR': [35.90, 127.76], 'DE': [51.16, 10.45], 'GB': [55.37, -3.43], 'NL': [52.13, 5.29], 'FR': [46.22, 2.21], 'CA': [56.13, -106.34], 'AU': [-25.27, 133.77], 'IN': [20.59, 78.96], 'BR': [-14.23, -51.92], 'RU': [61.52, 105.31], 'ZA': [-30.55, 22.93], 'TW': [23.69, 120.96], 'IT': [41.87, 12.56], 'SE': [60.12, 18.64], 'CH': [46.81, 8.22], 'ES': [40.46, -3.74], 'PL': [51.91, 19.14], 'FI': [61.92, 25.74], 'NO': [60.47, 8.46], 'DK': [56.26, 9.50], 'IE': [53.14, -7.69], 'AT': [47.51, 14.55], 'TR': [38.96, 35.24], 'AE': [23.42, 53.84], 'MY': [4.21, 101.97], 'TH': [15.87, 100.99], 'VN': [14.05, 108.27], 'PH': [12.87, 121.77], 'ID': [-0.78, 113.92], 'MO': [22.20, 113.55]
          };
          const iso2To3 = { "US":"USA","CN":"CHN","JP":"JPN","HK":"HKG","SG":"SGP","KR":"KOR","DE":"DEU","GB":"GBR", "NL":"NLD","FR":"FRA","CA":"CAN","AU":"AUS","IN":"IND","BR":"BRA","RU":"RUS","ZA":"ZAF", "TW":"TWN","IT":"ITA","SE":"SWE","CH":"CHE","ES":"ESP","PL":"POL","FI":"FIN","NO":"NOR", "DK":"DNK","IE":"IRL","AT":"AUT","TR":"TUR","AE":"ARE","MY":"MYS","TH":"THA","VN":"VNM", "PH":"PHL","ID":"IDN","MO":"MAC" };

          // 上游世界边界数据集(110m)只有 178 个要素,没有 HKG/MAC:香港的地块被 CHN 多边形吞掉,澳门连地块都没有。
          // 这里内嵌一份离线抽稀过的港澳边界(源 DataV 810000/820000,坐标 3 位小数),叠在世界图层之上,让两地独立填色。
          const SAR_GEOJSON = {"type":"FeatureCollection","features":[{"type":"Feature","id":"HKG","properties":{"name":"HKG"},"geometry":{"type":"MultiPolygon","coordinates":[[[[114.089,22.518],[114.069,22.514],[114.057,22.5],[114.029,22.503],[114.025,22.481],[114,22.49],[113.978,22.457],[113.906,22.404],[113.917,22.395],[113.92,22.368],[113.941,22.355],[113.957,22.353],[113.96,22.363],[113.98,22.366],[114.026,22.345],[113.955,22.298],[113.95,22.304],[113.968,22.311],[113.965,22.323],[113.898,22.309],[113.897,22.282],[113.856,22.254],[113.864,22.245],[113.843,22.229],[113.849,22.191],[113.895,22.216],[113.91,22.203],[113.936,22.205],[113.938,22.215],[113.976,22.231],[113.992,22.207],[114.009,22.212],[114.026,22.229],[114.005,22.239],[114.018,22.25],[114.006,22.268],[114.029,22.263],[114.034,22.3],[114.059,22.307],[114.078,22.33],[114.121,22.321],[114.144,22.303],[114.144,22.293],[114.12,22.272],[114.166,22.226],[114.179,22.226],[114.186,22.24],[114.2,22.233],[114.201,22.208],[114.213,22.21],[114.218,22.191],[114.229,22.194],[114.226,22.207],[114.238,22.214],[114.266,22.201],[114.258,22.224],[114.265,22.229],[114.256,22.242],[114.263,22.259],[114.25,22.283],[114.265,22.294],[114.276,22.26],[114.289,22.268],[114.304,22.257],[114.313,22.266],[114.303,22.281],[114.318,22.295],[114.278,22.329],[114.284,22.388],[114.303,22.381],[114.322,22.389],[114.323,22.379],[114.338,22.373],[114.341,22.349],[114.356,22.348],[114.361,22.332],[114.365,22.348],[114.397,22.364],[114.396,22.385],[114.381,22.399],[114.392,22.416],[114.411,22.409],[114.406,22.434],[114.376,22.437],[114.375,22.454],[114.365,22.46],[114.357,22.436],[114.347,22.438],[114.354,22.46],[114.347,22.477],[114.339,22.463],[114.328,22.478],[114.318,22.475],[114.278,22.435],[114.224,22.427],[114.203,22.44],[114.209,22.452],[114.22,22.444],[114.239,22.452],[114.222,22.45],[114.219,22.466],[114.234,22.467],[114.249,22.445],[114.263,22.45],[114.314,22.48],[114.34,22.509],[114.309,22.497],[114.283,22.509],[114.292,22.522],[114.269,22.524],[114.273,22.533],[114.262,22.547],[114.248,22.548],[114.232,22.528],[114.215,22.524],[114.233,22.54],[114.223,22.553],[114.167,22.559],[114.153,22.539],[114.117,22.527],[114.096,22.534],[114.084,22.527],[114.09,22.519],[114.089,22.518]]],[[[114.142,22.214],[114.126,22.228],[114.127,22.237],[114.111,22.232],[114.107,22.209],[114.125,22.212],[114.12,22.178],[114.143,22.175],[114.141,22.186],[114.156,22.179],[114.149,22.194],[114.166,22.207],[114.134,22.202],[114.142,22.212],[114.142,22.214]]],[[[114.328,22.339],[114.333,22.353],[114.322,22.376],[114.305,22.378],[114.308,22.348],[114.325,22.34],[114.328,22.339]]],[[[114.258,22.169],[114.26,22.152],[114.28,22.16],[114.272,22.178],[114.259,22.171],[114.258,22.169]]],[[[114.309,22.529],[114.3,22.544],[114.322,22.547],[114.295,22.553],[114.299,22.537],[114.29,22.531],[114.309,22.529]]],[[[114.036,22.207],[114.041,22.22],[114.032,22.219],[114.033,22.205],[114.023,22.195],[114.041,22.198],[114.046,22.203],[114.04,22.205],[114.036,22.207]]],[[[114.304,22.501],[114.326,22.514],[114.314,22.523],[114.309,22.508],[114.299,22.51],[114.303,22.502],[114.304,22.501]]],[[[114.296,22.255],[114.285,22.247],[114.292,22.235],[114.303,22.245],[114.297,22.255],[114.296,22.255]]],[[[114.366,22.462],[114.372,22.474],[114.364,22.484],[114.358,22.478],[114.364,22.462],[114.366,22.462]]],[[[114.042,22.256],[114.031,22.253],[114.05,22.238],[114.044,22.256],[114.042,22.256]]],[[[114.443,22.534],[114.447,22.54],[114.43,22.55],[114.439,22.534],[114.443,22.534]]],[[[114.047,22.277],[114.055,22.28],[114.045,22.284],[114.051,22.289],[114.037,22.287],[114.046,22.277],[114.047,22.277]]],[[[114.301,22.35],[114.298,22.373],[114.292,22.365],[114.3,22.35],[114.301,22.35]]],[[[114.25,22.175],[114.261,22.187],[114.248,22.186],[114.249,22.176],[114.25,22.175]]],[[[114.332,22.323],[114.336,22.33],[114.322,22.338],[114.331,22.323],[114.332,22.323]]],[[[114.324,22.52],[114.325,22.535],[114.321,22.528],[114.313,22.532],[114.323,22.52],[114.324,22.52]]],[[[113.995,22.186],[113.992,22.199],[113.987,22.191],[113.994,22.186],[113.995,22.186]]],[[[113.908,22.153],[113.922,22.165],[113.907,22.154],[113.908,22.153]]]]}},{"type":"Feature","id":"MAC","properties":{"name":"MAC"},"geometry":{"type":"MultiPolygon","coordinates":[[[[113.554,22.125],[113.554,22.107],[113.576,22.108],[113.604,22.133],[113.574,22.206],[113.549,22.214],[113.538,22.209],[113.541,22.199],[113.533,22.179],[113.555,22.142],[113.554,22.125]]],[[[113.587,22.201],[113.576,22.201],[113.576,22.194],[113.586,22.196],[113.587,22.201]]]]}}]};
          // 香港与澳门实际相距约 60 公里,默认缩放下不足 2 像素,两个 22px 徽章会完全重叠;用固定像素锚点把两者错开。
          const badgeAnchors = { 'HK': [-1, 19], 'MO': [23, 3] };

          async function initMap() {
            window.myMap = L.map('map-container', { zoomControl: true, attributionControl: false, minZoom: 1 }).setView([30, 10], 2);
            try {
                const res = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json');
                worldGeoJson = await res.json();
                drawMarkers();
            } catch (e) {}
          }

          function drawMarkers() {
            if(!window.myMap || !worldGeoJson) return;
            const newDataStr = document.getElementById('map-data').textContent;
            if (currentMapDataStr === newDataStr) return;
            currentMapDataStr = newDataStr;

            if(geoJsonLayer) window.myMap.removeLayer(geoJsonLayer);
            if(sarLayer) window.myMap.removeLayer(sarLayer);
            if(markersLayer) markersLayer.clearLayers(); else markersLayer = L.layerGroup().addTo(window.myMap);

            const data = JSON.parse(newDataStr);
            const isDark = document.body.className.includes('theme2') || document.body.className.includes('theme5') || document.body.className.includes('theme4') || document.body.className.includes('theme8') || document.body.className.includes('theme6');
            const activeIso3 = {}; for (const code in data) { if (iso2To3[code]) activeIso3[iso2To3[code]] = true; }

            // 世界图层与港澳图层共用同一份配色描边规则,避免改一处漏一处
            const regionStyle = function(feature) {
                const isActive = activeIso3[feature.id];
                return { fillColor: isActive ? '#10b981' : (isDark ? '#2a303c' : '#d5dce2'), weight: 1, opacity: 1, color: isDark ? '#1a202c' : '#ffffff', fillOpacity: 1 };
            };

            geoJsonLayer = L.geoJSON(worldGeoJson, { style: regionStyle }).addTo(window.myMap);
            // 后加所以在上层,港澳的填色状态不再受大陆影响
            sarLayer = L.geoJSON(SAR_GEOJSON, { style: regionStyle }).addTo(window.myMap);

            for (const [code, count] of Object.entries(data)) {
              if(countryCoords[code]) {
                const icon = L.divIcon({ className: 'custom-map-badge', html: \`<div>\${count}</div>\`, iconSize: [22,22], iconAnchor: badgeAnchors[code] || [11,11] });
                L.marker(countryCoords[code], {icon: icon}).addTo(markersLayer);
              }
            }
          }

          document.addEventListener('DOMContentLoaded', () => {
             const savedView = localStorage.getItem('monitor_preferred_view') || 'card';
             switchView(savedView); applyFilter(); applySpeedAnimations();
          });

          setInterval(async () => {
            try {
              const currentUrl = new URL(location.href);
              currentUrl.searchParams.set('ajax', '1');
              const res = await fetch(currentUrl.toString());
              const htmlText = await res.text();
              const parser = new DOMParser();
              const newDoc = parser.parseFromString(htmlText, 'text/html');
              
              document.getElementById('ajax-stats').innerHTML = newDoc.getElementById('ajax-stats').innerHTML;
              document.getElementById('ajax-cards').innerHTML = newDoc.getElementById('ajax-cards').innerHTML;
              document.getElementById('ajax-table').innerHTML = newDoc.getElementById('ajax-table').innerHTML;
              document.getElementById('ajax-filters').innerHTML = newDoc.getElementById('ajax-filters').innerHTML;
              document.getElementById('map-data').textContent = newDoc.getElementById('map-data').textContent;

              drawMarkers(); applyFilter(); applySpeedAnimations();
            } catch (e) {}
          }, 4000);
        </script>`;
}
