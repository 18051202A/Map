// Wait for both DOM and Mapbox GL to be ready
let map;
document.addEventListener('DOMContentLoaded', () => {
  if (typeof mapboxgl === 'undefined') {
    console.error('Mapbox GL JS is not loaded.');
    return;
  }

  // Add loading overlay (no video)
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'loading-overlay';
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: opacity 0.5s ease-out;
  `;
  document.body.appendChild(loadingOverlay);

  // Remove overlay after map is loaded
  function removeOverlay() {
    loadingOverlay.style.opacity = '0';
    setTimeout(() => loadingOverlay.remove(), 500);
  }

  // === MAP INITIALIZATION ===
  mapboxgl.accessToken = 'pk.eyJ1IjoiMTgwNTEwMmEiLCJhIjoiY204a21qaXpqMHc0cjJsc2RodnB5YjJ3MSJ9.m58oTULqdP8VQTh8Ai4wNA';
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    projection: 'globe',
    center: [10, 20],
    zoom: 1.5,
    minZoom: 1.1,
    maxBounds: [[-180, -85], [180, 85]]
  });

  // Wait for map load before adding layers and event handlers
  map.on('load', async () => {
    console.log('Map loaded, setting up layers...');
    
    // Load data first
    await loadData();
    
    // Add country borders source
    map.addSource('country-borders', {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1'
    });

    // Add border layers
    map.addLayer({
      id: 'country-borders-line',
      type: 'line',
      source: 'country-borders',
      'source-layer': 'country_boundaries',
      paint: {
        'line-color': '#133c36',
        'line-width': 1.5,
        'line-opacity': 0.8
      }
    });

    map.addLayer({
      id: 'country-click-area',
      type: 'fill',
      source: 'country-borders',
      'source-layer': 'country_boundaries',
      paint: { 'fill-opacity': 0 }
    });

    map.addLayer({
      id: 'country-highlight-border',
      type: 'line',
      source: 'country-borders',
      'source-layer': 'country_boundaries',
      paint: {
        'line-color': '#421110',
        'line-width': 1.5
      },
      filter: ['==', 'iso_3166_1_alpha_3', '']
    });

    // Setup click handler for countries
    map.on('click', 'country-click-area', (e) => {
      if (!countryInfo || Object.keys(countryInfo).length === 0) {
        console.warn('Country info not loaded yet');
        return;
      }
      const features = e.features;
      if (features.length > 0) {
        const feature = features[0];
        const iso3 = feature.properties.iso_3166_1_alpha_3;
        const countryName = feature.properties.name_en;
        lastSelectedCountry = iso3;
        // Update flag using iso3to2 conversion
        const iso2 = iso3to2[iso3];
        if (iso2) {
          document.getElementById('flag-img').src = `https://flagcdn.com/w320/${iso2.toLowerCase()}.png`;
        }
        map.setFilter('country-highlight-border', ['==', ['get', 'iso_3166_1_alpha_3'], iso3]);
        document.getElementById('sidebar-title').textContent = countryName;
        // Show info button, hide sidebar
        const infoButton = document.getElementById('info-button');
        const sidebar = document.getElementById('info-sidebar');
        if (infoButton && sidebar) {
          infoButton.style.display = 'flex';
          infoButton.style.visibility = 'visible';
          infoButton.classList.add('visible');
          sidebar.classList.remove('visible');
        }
        // Update leader info
        const info = countryInfo[iso3];
        if (info && info.leader) {
          document.getElementById('leader-name').textContent = info.leader;
          document.getElementById('leader-img').src = info.leaderImg || 'img/placeholder.png';
          document.getElementById('leader-party').textContent = "Political party: " + (info.party || "Unknown");
          document.getElementById('leader-button').style.display = 'flex';
        } else {
          document.getElementById('leader-name').textContent = 'No data';
          document.getElementById('leader-img').src = 'img/placeholder.png';
          document.getElementById('leader-party').textContent = "Political party: Unknown";
          document.getElementById('leader-button').style.display = 'none';
        }
      }
    });

    // Change cursor when hovering over countries
    map.on('mouseenter', 'country-click-area', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'country-click-area', () => {
      map.getCanvas().style.cursor = '';
    });

    // Attach point click handler after layers are loaded
    if (map.getLayer('points')) {
      map.on('click', 'points', (e) => {
        if (e.features && e.features.length > 0) {
          console.log('Point clicked:', e.features[0]);
          showPointInfo(e.features[0]);
        } else {
          console.log('No point feature found on click.');
        }
      });
    } else {
      console.log('Layer "points" not found.');
    }

    // Setup UI components after map and data are loaded
    setupEventHandlers();
    setupTabHandlers();
    
    console.log('✅ Map layers and handlers setup complete');

    // --- Mark map as done and try to remove overlay ---
    removeOverlay();
  });

  // Fallback: Remove overlay after 10 seconds if map fails to load
  setTimeout(() => {
    if (document.body.contains(loadingOverlay)) {
      loadingOverlay.style.opacity = '0';
      setTimeout(() => loadingOverlay.remove(), 500);
    }
  }, 10000);

  // === DOM ELEMENTS ===
  const mapContainer = document.getElementById('map');
  const commandInput = document.getElementById('command-input');
  const suggestionsBox = document.getElementById('suggestions');
  const projectsSidebar = document.getElementById('projects-sidebar');
  const addProjectBtn = projectsSidebar?.querySelector('.add-project-btn');
  const closeProjectsSidebarBtn = projectsSidebar?.querySelector('#close-projects-sidebar-btn');
  const projectsContent = projectsSidebar?.querySelector('.projects-content');
  const projectModal = document.getElementById('project-modal');
  const projectNameInput = projectModal?.querySelector('input[type="text"]');
  const continueProjectBtn = projectModal?.querySelector('.continue-btn');
  const projectTopbar = document.getElementById('project-topbar');
  const activeProjectName = projectTopbar?.querySelector('#active-project-name');
  const closeProjectBtn = projectTopbar?.querySelector('#close-project-btn');

  // === STATE ===
  let lastSelectedCountry = null;
  let militaryData = {};
  let countryInfo = {};
  let activeLayer = null;
  let activeProject = null;
  let projects = [];
  let calendarState = null;

  // === UTILS ===
  function logError(msg) { console.error('[ProjectMgr]', msg); }
  function show(el) { if (el) el.style.display = 'flex'; }
  function hide(el) { if (el) el.style.display = 'none'; }
  function showBlock(el) { if (el) el.style.display = 'block'; }
  function hideBlock(el) { if (el) el.style.display = 'none'; }

  // === PROJECTS STORAGE ===
  function loadProjects() {
    try {
      const data = localStorage.getItem('projects');
      projects = data ? JSON.parse(data) : [];
    } catch (e) {
      projects = [];
      logError('Failed to load projects from localStorage.');
    }
  }
  function saveProjects() {
    try {
      localStorage.setItem('projects', JSON.stringify(projects));
    } catch (e) {
      logError('Failed to save projects to localStorage.');
    }
  }

  // === PROJECTS UI ===
  function updateProjectsList() {
    if (!projectsContent) return;
    projectsContent.innerHTML = '';
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No projects yet.';
      empty.style.color = '#aaa';
      projectsContent.appendChild(empty);
      return;
    }
    projects.forEach(project => {
      const div = document.createElement('div');
      div.className = 'project-item';
      div.innerHTML = `<h3>${project.name}</h3><p>Created: ${new Date(project.created).toLocaleDateString()}</p>`;
      div.onclick = () => openProject(project);
      projectsContent.appendChild(div);
    });
  }

  function openProjectsSidebar() {
    if (projectsSidebar && projectsContent) {
      updateProjectsList();
    }
    show(projectsSidebar);
    projectsSidebar.style.zIndex = '10000';
  }
  function closeProjectsSidebar() { hide(projectsSidebar); }

  function openProjectModal() {
    closeProjectsSidebar();
    show(projectModal);
    if (projectNameInput) {
      projectNameInput.value = '';
      projectNameInput.focus();
    }
  }
  function closeProjectModal() { hide(projectModal); }

  function createProject(name) {
    const project = {
      name,
      created: Date.now(),
      layers: [],
      settings: {}
    };
    projects.push(project);
    saveProjects();
    updateProjectsList();
    openProject(project);
  }

  function openProject(project) {
    activeProject = project;
    document.body.classList.add('project-mode');
    showBlock(projectTopbar);
    if (activeProjectName) activeProjectName.textContent = project.name;
    showBlock(closeProjectBtn);
    closeProjectsSidebar();

    // Toolbox logic
    let toolbox = document.getElementById('toolbox');
    if (!toolbox) {
      toolbox = document.createElement('div');
      toolbox.id = 'toolbox';
      toolbox.style.cssText = `
        position: fixed;
        left: 20px;
        top: 20px;
        background: rgba(35, 40, 58, 0.95);
        border-radius: 10px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 44px;
        height: 44px;
        align-items: center;
        justify-content: center;
      `;
      // Investigation board button
      const investigationBtn = document.createElement('button');
      investigationBtn.className = 'tool-btn';
      investigationBtn.innerHTML = `<span style="font-size:22px;">🔍</span>`;
      investigationBtn.style.cssText = `
        background: rgba(58, 63, 90, 0.8);
        border: none;
        border-radius: 8px;
        width: 36px;
        height: 36px;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        transition: background 0.2s;
        padding: 0;
      `;
      investigationBtn.onmouseover = () => {
        investigationBtn.style.background = 'rgba(70, 75, 102, 0.8)';
      };
      investigationBtn.onmouseout = () => {
        investigationBtn.style.background = 'rgba(58, 63, 90, 0.8)';
      };
      investigationBtn.onclick = () => {
        investigationOverlay.style.display = 'flex';
      };
      toolbox.appendChild(investigationBtn);
      document.body.appendChild(toolbox);
    } else {
      toolbox.style.display = 'flex';
    }
  }
  function closeProject() {
    if (!activeProject) return;
    document.body.classList.remove('project-mode');
    activeProject = null;
    hideBlock(projectTopbar);
    if (activeProjectName) activeProjectName.textContent = '';
    hideBlock(closeProjectBtn);
    // Hide toolbox
    const toolbox = document.getElementById('toolbox');
    if (toolbox) toolbox.style.display = 'none';
  }

  // === EVENT BINDINGS ===
  if (addProjectBtn) addProjectBtn.onclick = openProjectModal;
  if (closeProjectsSidebarBtn) closeProjectsSidebarBtn.onclick = closeProjectsSidebar;
  if (continueProjectBtn) continueProjectBtn.onclick = () => {
    const name = projectNameInput?.value.trim();
    if (!name) {
      if (projectNameInput) {
        projectNameInput.style.border = '2px solid #e74c3c';
        projectNameInput.focus();
        setTimeout(() => { projectNameInput.style.border = '1px solid #bbb'; }, 1000);
      }
      return;
    }
    closeProjectModal();
    createProject(name);
  };
  if (projectNameInput) projectNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') continueProjectBtn?.click();
    if (e.key === 'Escape') closeProjectModal();
  });
  if (closeProjectBtn) closeProjectBtn.onclick = closeProject;

  // === COMMAND SYSTEM ===
  const availableCommands = [
    '/ports','/nuclear','/oil','/pipelines','/powerlines','/refineries','/industrial','/trade','/satellite','/satellite-off','/flat','/globe','/projects'
  ];
  const dataTypes = {
    '/ports': 'ports', '/nuclear': 'nuclear', '/oil': 'oil_fields', '/pipelines': 'pipelines', '/powerlines': 'powerlines', '/refineries': 'refineries', '/industrial': 'industrial_zones', '/trade': 'trade_zones'
  };

  // === INITIALIZE ===
  loadProjects();
  updateProjectsList();
  hide(projectsSidebar);
  hide(projectModal);
  hideBlock(projectTopbar);
  if (activeProjectName) activeProjectName.textContent = '';
  hideBlock(closeProjectBtn);

  // === MAP INITIALIZATION (unchanged, but ensure it works) ===
  mapboxgl.accessToken = 'pk.eyJ1IjoiMTgwNTEwMmEiLCJhIjoiY204a21qaXpqMHc0cjJsc2RodnB5YjJ3MSJ9.m58oTULqdP8VQTh8Ai4wNA';
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    projection: 'globe',
    center: [10, 20],
    zoom: 1.5,
    minZoom: 1.1,
    maxBounds: [[-180, -85], [180, 85]]
  });

  // Setup command handlers after map is initialized
  setupCommandHandlers();

  // Military UI functions
  function clearMilitaryUI() {
    const militaryInfo = document.getElementById('military-info');
    if (militaryInfo) {
      militaryInfo.style.display = 'none';
      militaryInfo.innerHTML = '';
    }
  }

  function showMilitaryInfo(countryCode) {
    const militaryInfo = document.getElementById('military-info');
    if (!militaryInfo || !militaryData[countryCode]) return;

    const data = militaryData[countryCode];
    militaryInfo.innerHTML = `
      <div class="military-stats">
        <h3>Military Statistics</h3>
        <p>Active Personnel: ${data.activePersonnel || 'N/A'}</p>
        <p>Reserve Personnel: ${data.reservePersonnel || 'N/A'}</p>
        <p>Total Aircraft: ${data.totalAircraft || 'N/A'}</p>
        <p>Total Tanks: ${data.totalTanks || 'N/A'}</p>
      </div>
    `;
    militaryInfo.style.display = 'block';
  }

  // Load data files
  async function loadData() {
    try {
      const [infoRes, militaryRes] = await Promise.all([
        fetch('Data/country-info.json'),
        fetch('Data/country-military.json')
      ]);
      countryInfo = await infoRes.json();
      militaryData = await militaryRes.json();
      window.countryInfoLoaded = true;
    } catch (err) {
      console.error('Error loading data:', err);
    }
  }

  // Setup all event handlers
  function setupEventHandlers() {
    const sidebar = document.getElementById('info-sidebar');
    const infoButton = document.getElementById('info-button');

    if (!sidebar || !infoButton) {
      console.error('Info sidebar or button not found');
      return;
    }

    // Remove any previous click handler
    infoButton.onclick = null;

    // Set initial state
    infoButton.style.display = 'flex';
    infoButton.style.visibility = 'hidden';
    infoButton.classList.remove('visible');

    // Add click handler directly
    infoButton.onclick = (e) => {
      console.log('Info button clicked');
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.add('visible');
      infoButton.classList.remove('visible');
      setupTabHandlers();
    };
  }

  // Add iso3 to iso2 conversion for flags
  const iso3to2 = {
    AFG: 'af', ALB: 'al', DZA: 'dz', AND: 'ad', AGO: 'ao', ARG: 'ar', ARM: 'am', AUS: 'au',
    AUT: 'at', AZE: 'az', BHS: 'bs', BHR: 'bh', BGD: 'bd', BRB: 'bb', BLR: 'by', BEL: 'be',
    BLZ: 'bz', BEN: 'bj', BTN: 'bt', BOL: 'bo', BIH: 'ba', BWA: 'bw', BRA: 'br', BRN: 'bn',
    BGR: 'bg', BFA: 'bf', BDI: 'bi', KHM: 'kh', CMR: 'cm', CAN: 'ca', CPV: 'cv', CAF: 'cf',
    TCD: 'td', CHL: 'cl', CHN: 'cn', COL: 'co', COM: 'km', COG: 'cg', COD: 'cd', CRI: 'cr',
    CIV: 'ci', HRV: 'hr', CUB: 'cu', CYP: 'cy', CZE: 'cz', DNK: 'dk', DJI: 'dj', DMA: 'dm',
    DOM: 'do', ECU: 'ec', EGY: 'eg', SLV: 'sv', GNQ: 'gq', ERI: 'er', EST: 'ee', ETH: 'et',
    FJI: 'fj', FIN: 'fi', FRA: 'fr', GAB: 'ga', GMB: 'gm', GEO: 'ge', DEU: 'de', GHA: 'gh',
    GRC: 'gr', GRD: 'gd', GTM: 'gt', GIN: 'gn', GNB: 'gw', GUY: 'gy', HTI: 'ht', HND: 'hn',
    HUN: 'hu', ISL: 'is', IND: 'in', IDN: 'id', IRN: 'ir', IRQ: 'iq', IRL: 'ie', ISR: 'il',
    ITA: 'it', JAM: 'jm', JPN: 'jp', JOR: 'jo', KAZ: 'kz', KEN: 'ke', KIR: 'ki', KWT: 'kw',
    KGZ: 'kg', LAO: 'la', LVA: 'lv', LBN: 'lb', LSO: 'ls', LBR: 'lr', LBY: 'ly', LIE: 'li',
    LTU: 'lt', LUX: 'lu', MKD: 'mk', MDG: 'mg', MWI: 'mw', MYS: 'my', MDV: 'mv', MLI: 'ml',
    MLT: 'mt', MHL: 'mh', MRT: 'mr', MUS: 'mu', MEX: 'mx', FSM: 'fm', MDA: 'md', MCO: 'mc',
    MNG: 'mn', MNE: 'me', MAR: 'ma', MOZ: 'mz', MMR: 'mm', NAM: 'na', NRU: 'nr', NPL: 'np',
    NLD: 'nl', NZL: 'nz', NIC: 'ni', NER: 'ne', NGA: 'ng', PRK: 'kp', NOR: 'no', OMN: 'om',
    PAK: 'pk', PLW: 'pw', PAN: 'pa', PNG: 'pg', PRY: 'py', PER: 'pe', PHL: 'ph', POL: 'pl',
    PRT: 'pt', QAT: 'qa', ROU: 'ro', RUS: 'ru', RWA: 'rw', KNA: 'kn', LCA: 'lc', VCT: 'vc',
    WSM: 'ws', SMR: 'sm', STP: 'st', SAU: 'sa', SEN: 'sn', SRB: 'rs', SYC: 'sc', SLE: 'sl',
    SGP: 'sg', SVK: 'sk', SVN: 'si', SLB: 'sb', SOM: 'so', ZAF: 'za', KOR: 'kr', SSD: 'ss',
    ESP: 'es', LKA: 'lk', SDN: 'sd', SUR: 'sr', SWZ: 'sz', SWE: 'se', CHE: 'ch', SYR: 'sy',
    TWN: 'tw', TJK: 'tj', TZA: 'tz', THA: 'th', TLS: 'tl', TGO: 'tg', TON: 'to', TTO: 'tt',
    TUN: 'tn', TUR: 'tr', TKM: 'tm', TUV: 'tv', UGA: 'ug', UKR: 'ua', ARE: 'ae', GBR: 'gb',
    USA: 'us', URY: 'uy', UZB: 'uz', VUT: 'vu', VAT: 'va', VEN: 've', VNM: 'vn', YEM: 'ye',
    ZMB: 'zm', ZWE: 'zw'
  };

  function showDataPoints(dataType) {
    // Clear any existing layers
    if (activeLayer) {
      if (map.getLayer(activeLayer)) {
        map.removeLayer(activeLayer);
      }
      if (map.getSource(activeLayer)) {
        map.removeSource(activeLayer);
      }
    }

    // Load data file based on type
    fetch(`Data/${dataType}.json`)
      .then(res => res.json())
      .then(data => {
        const geojson = {
          type: 'FeatureCollection',
          features: Array.isArray(data) ? 
            // Handle array format (ports)
            data.map(point => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: point.coordinates || [point.location?.lng, point.location?.lat]
              },
              properties: {
                name: point.name,
                type: point.type || dataType,
                description: point.description || `${point.name} (${dataType})`
              }
            })) :
            // Handle object format (other data types)
            Object.values(data).flat().map(point => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [point.location.lng, point.location.lat]
              },
              properties: {
                name: point.name,
                type: point.type,
                description: point.description
              }
            }))
        };

        const layerId = `${dataType}-points`;
        activeLayer = layerId;

        // Add or update the source and layer
        if (map.getSource(layerId)) {
          map.getSource(layerId).setData(geojson);
        } else {
          map.addSource(layerId, {
            type: 'geojson',
            data: geojson
          });

          map.addLayer({
            id: layerId,
            type: 'circle',
            source: layerId,
            paint: {
              'circle-radius': 12, // Increased from 3 for better visibility
              'circle-color': '#ffffff',
              'circle-stroke-color': '#000000',
              'circle-stroke-width': 2, // Slightly thicker border
              'circle-opacity': 0.95 // Slightly more visible
            }
          });

          // Change cursor on hover
          map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      })
      .catch(err => console.error(`Error loading ${dataType} data:`, err));
  }

  function setupCommandHandlers() {
    const commandInput = document.getElementById('command-input');
    const suggestionsBox = document.getElementById('suggestions');
    
    if (!commandInput || !suggestionsBox) {
      console.error('Required UI elements not found');
      return;
    }

    const dataTypes = {
      '/ports': 'ports',
      '/nuclear': 'nuclear',
      '/oil': 'oil_fields',
      '/pipelines': 'pipelines',
      '/powerlines': 'powerlines',
      '/refineries': 'refineries',
      '/industrial': 'industrial_zones',
      '/trade': 'trade_zones'
    };

    commandInput.addEventListener('input', () => {
      const input = commandInput.value.trim().toLowerCase();
      suggestionsBox.innerHTML = '';

      if (!input) {
        suggestionsBox.style.display = 'none';
        return;
      }

      const matches = availableCommands.filter(cmd => cmd.startsWith(input));
      if (matches.length > 0) {
        suggestionsBox.style.display = 'block';
        matches.forEach(cmd => {
          const div = document.createElement('div');
          div.textContent = cmd;
          div.classList.add('suggestion-item');
          div.addEventListener('click', () => {
            commandInput.value = cmd;
            suggestionsBox.style.display = 'none';
            commandInput.focus();
          });
          suggestionsBox.appendChild(div);
        });
      } else {
        suggestionsBox.style.display = 'none';
      }
    });

    commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        suggestionsBox.style.display = 'none';
        const cmd = commandInput.value.trim().toLowerCase();
        commandInput.value = '';

        // Handle different commands
        switch (cmd) {
          case '/satellite':
            map.setStyle('mapbox://styles/mapbox/satellite-v9');
            break;
          case '/satellite-off':
            map.setStyle('mapbox://styles/mapbox/dark-v11');
            break;
          case '/flat':
            map.setProjection('mercator');
            map.setMinZoom(1.1); // Prevent zooming out too far, fits world
            map.setMaxBounds([[-180, -85], [180, 85]]); // Restrict panning/zooming to world
            break;
          case '/globe':
            map.setProjection('globe');
            break;
          case '/projects':
            openProjectsSidebar();
            break;
          default:
            if (dataTypes[cmd]) {
              showDataPoints(dataTypes[cmd]);
            }
            break;
        }
      }
    });
  }

  // --- Country Context Menu ---
  let countryContextMenu = document.getElementById('country-context-menu');
  if (!countryContextMenu) {
    countryContextMenu = document.createElement('div');
    countryContextMenu.id = 'country-context-menu';
    countryContextMenu.style.cssText = `
      position: fixed;
      z-index: 10020;
      min-width: 180px;
      background: rgba(35,40,58,0.98);
      color: #e0e0e0;
      border-radius: 10px;
      box-shadow: 0 4px 24px #000a;
      border: 1px solid rgba(255,255,255,0.08);
      display: none;
      flex-direction: column;
      padding: 0;
      overflow: hidden;
    `;
    document.body.appendChild(countryContextMenu);
  }
  let contextMenuFeature = null;

  function hideCountryContextMenu() {
    if (countryContextMenu) countryContextMenu.style.display = 'none';
    contextMenuFeature = null;
  }

  function showCountryContextMenu(x, y, feature) {
    if (!countryContextMenu) return;
    countryContextMenu.innerHTML = '';
    const infoItem = document.createElement('div');
    infoItem.className = 'context-item';
    infoItem.textContent = 'Info';
    infoItem.onclick = () => {
      hideCountryContextMenu();
      showCountryInfoSidebar(feature);
    };
    countryContextMenu.appendChild(infoItem);
    countryContextMenu.style.left = x + 'px';
    countryContextMenu.style.top = y + 'px';
    countryContextMenu.style.display = 'flex';
    contextMenuFeature = feature;
  }

  // Hide context menu on map click or escape
  document.addEventListener('click', (e) => {
    if (countryContextMenu && countryContextMenu.style.display === 'flex') {
      if (!countryContextMenu.contains(e.target)) hideCountryContextMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCountryContextMenu();
  });

  // --- Country right-click logic ---
  map.on('contextmenu', 'country-click-area', (e) => {
    e.preventDefault();
    hideCountryContextMenu();
    if (!e.features || !e.features.length) return;
    const feature = e.features[0];
    // Show context menu at mouse position
    showCountryContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, feature);
  });

  // --- Show country info sidebar and highlight border ---
  function showCountryInfoSidebar(feature) {
    if (!feature) return;
    const iso3 = feature.properties.iso_3166_1_alpha_3;
    const countryName = feature.properties.name_en;
    lastSelectedCountry = iso3;
    // Highlight border
    if (map.getLayer('country-highlight-border')) {
      map.setFilter('country-highlight-border', ['==', ['get', 'iso_3166_1_alpha_3'], iso3]);
    }
    // Update flag using iso3to2 conversion
    const iso2 = iso3to2[iso3];
    if (iso2) {
      document.getElementById('flag-img').src = `https://flagcdn.com/w320/${iso2.toLowerCase()}.png`;
    }
    document.getElementById('sidebar-title').textContent = countryName;
    // Update leader info
    const info = countryInfo[iso3];
    if (info && info.leader) {
      document.getElementById('leader-name').textContent = info.leader;
      document.getElementById('leader-img').src = info.leaderImg || 'img/placeholder.png';
      document.getElementById('leader-party').textContent = "Political party: " + (info.party || "Unknown");
      document.getElementById('leader-button').style.display = 'flex';
    } else {
      document.getElementById('leader-name').textContent = 'No data';
      document.getElementById('leader-img').src = 'img/placeholder.png';
      document.getElementById('leader-party').textContent = "Political party: Unknown";
      document.getElementById('leader-button').style.display = 'none';
    }
    // Show sidebar
    const sidebar = document.getElementById('info-sidebar');
    if (sidebar) sidebar.classList.add('visible');
  }

  // --- Hide info sidebar and clear selection on map click (not on country) ---
  map.on('click', (e) => {
    // Check if click is on a country
    const features = map.queryRenderedFeatures(e.point, { layers: ['country-click-area'] });
    if (!features.length) {
      // Hide sidebar and clear selection
      const sidebar = document.getElementById('info-sidebar');
      if (sidebar) sidebar.classList.remove('visible');
      lastSelectedCountry = null;
      // Remove border highlight
      if (map.getLayer('country-highlight-border')) {
        map.setFilter('country-highlight-border', ['==', ['get', 'iso_3166_1_alpha_3'], '']);
      }
    }
  });

  // Optionally, clicking outside the sidebar closes it
  document.addEventListener('mousedown', (e) => {
    const sidebar = document.getElementById('info-sidebar');
    if (sidebar && sidebar.classList.contains('visible')) {
      if (!sidebar.contains(e.target) && !e.target.classList.contains('context-item')) {
        sidebar.classList.remove('visible');
        lastSelectedCountry = null;
      }
    }
  });

  // --- Make leader button open the floating overlay window ---
  const leaderButton = document.getElementById('leader-button');
  const leaderOverlay = document.getElementById('leader-overlay');
  const leaderOverlayClose = document.getElementById('leader-overlay-close');
  const leaderOverlayContent = document.getElementById('leader-overlay-content');
  let leadershipData = null;

  if (leaderButton && leaderOverlay && leaderOverlayClose && leaderOverlayContent) {
    leaderButton.onclick = async function(e) {
      e.preventDefault();
      // Show overlay
      leaderOverlay.style.display = 'flex';
      leaderOverlay.focus();
      // Load leadership.json if not loaded
      if (!leadershipData) {
        try {
          const res = await fetch('leadership.json');
          leadershipData = await res.json();
        } catch (err) {
          leaderOverlayContent.innerHTML = '<div style="color:#fff">Failed to load leadership data.</div>';
          return;
        }
      }
      // Find country code (lastSelectedCountry)
      const countryCode = lastSelectedCountry;
      if (!countryCode || !leadershipData[countryCode]) {
        leaderOverlayContent.innerHTML = '<div style="color:#fff">No leadership data for this country.</div>';
        return;
      }
      renderLeaderBubbleMap(leadershipData[countryCode]);
    };
    leaderOverlayClose.onclick = function() {
      leaderOverlay.style.display = 'none';
    };
  }

  // --- Draggable and Resizable Overlay Logic ---
  // Add resizer handles
  function addOverlayResizers(overlay) {
    const positions = ['n','s','e','w','nw','ne','sw','se'];
    positions.forEach(pos => {
      const handle = document.createElement('div');
      handle.className = 'leader-overlay-resizer ' + pos;
      handle.dataset.pos = pos;
      overlay.appendChild(handle);
    });
  }
  if (leaderOverlay && !leaderOverlay.querySelector('.leader-overlay-resizer')) {
    addOverlayResizers(leaderOverlay);
  }

  // Drag logic
  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
  let isResizing = false, resizeDir = '', startRect = null, startMouse = null;

  // Drag
  const header = leaderOverlay?.querySelector('.leader-overlay-header');
  if (header) {
    header.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('leader-overlay-close')) return;
      isDragging = true;
      dragOffsetX = e.clientX - leaderOverlay.offsetLeft;
      dragOffsetY = e.clientY - leaderOverlay.offsetTop;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function(e) {
      if (isDragging) {
        let x = e.clientX - dragOffsetX;
        let y = e.clientY - dragOffsetY;
        // Keep within viewport
        x = Math.max(0, Math.min(window.innerWidth - leaderOverlay.offsetWidth, x));
        y = Math.max(0, Math.min(window.innerHeight - leaderOverlay.offsetHeight, y));
        leaderOverlay.style.left = x + 'px';
        leaderOverlay.style.top = y + 'px';
      }
    });
    document.addEventListener('mouseup', function() {
      isDragging = false;
      document.body.style.userSelect = '';
    });
  }

  // Resize
  leaderOverlay?.querySelectorAll('.leader-overlay-resizer').forEach(handle => {
    handle.addEventListener('mousedown', function(e) {
      isResizing = true;
      resizeDir = handle.dataset.pos;
      startRect = leaderOverlay.getBoundingClientRect();
      startMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      e.stopPropagation();
      document.body.style.userSelect = 'none';
    });
  });
  document.addEventListener('mousemove', function(e) {
    if (isResizing && startRect && startMouse) {
      let dx = e.clientX - startMouse.x;
      let dy = e.clientY - startMouse.y;
      let left = startRect.left, top = startRect.top, width = startRect.width, height = startRect.height;
      // Handle each direction
      if (resizeDir.includes('e')) width = Math.min(Math.max(340, startRect.width + dx), window.innerWidth - left);
      if (resizeDir.includes('s')) height = Math.min(Math.max(320, startRect.height + dy), window.innerHeight - top);
      if (resizeDir.includes('w')) {
        let newLeft = Math.max(0, left + dx);
        width = Math.min(Math.max(340, startRect.right - newLeft), window.innerWidth - newLeft);
        leaderOverlay.style.left = newLeft + 'px';
      }
      if (resizeDir.includes('n')) {
        let newTop = Math.max(0, top + dy);
        height = Math.min(Math.max(320, startRect.bottom - newTop), window.innerHeight - newTop);
        leaderOverlay.style.top = newTop + 'px';
      }
      leaderOverlay.style.width = width + 'px';
      leaderOverlay.style.height = height + 'px';
    }
  });
  document.addEventListener('mouseup', function() {
    isResizing = false;
    document.body.style.userSelect = '';
  });

  // --- Render Bubble Map from leadership.json ---
  function renderLeaderBubbleMap(data) {
    // Party/org name and logo at the top
    let html = `<div style="width:100%;text-align:center;margin-bottom:18px;">
      ${data.logo ? `<img src="${data.logo}" alt="logo" style="height:38px;max-width:120px;margin-bottom:8px;filter:drop-shadow(0 2px 8px #0002);"><br>` : ''}
      <span style="font-size:1.18rem;font-weight:600;color:#fff;">${data.party || 'Leadership'}</span>
    </div>`;
    // Build tree structure from flat array
    const nodes = data.members;
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const tree = [];
    nodes.forEach(n => {
      if (!n.parent) tree.push(n);
      else {
        byId[n.parent].children = byId[n.parent].children || [];
        byId[n.parent].children.push(n);
      }
    });
    // Simple pyramid layout: top node, then children, then grandchildren
    // (for more complex trees, use D3.js)
    let levels = [];
    function traverse(node, depth) {
      levels[depth] = levels[depth] || [];
      levels[depth].push(node);
      (node.children||[]).forEach(child => traverse(child, depth+1));
    }
    tree.forEach(root => traverse(root, 0));
    // Layout constants
    const width = 420, height = 340, levelGap = 110;
    let y = 60;
    let svgNodes = '', svgEdges = '';
    levels.forEach((level, i) => {
      const gap = width / (level.length+1);
      level.forEach((node, j) => {
        node._x = gap*(j+1);
        node._y = y + i*levelGap;
      });
    });
    // Edges
    nodes.forEach(n => {
      if (n.parent) {
        const p = byId[n.parent];
        svgEdges += `<path d="M${p._x},${p._y+32} Q${(p._x+n._x)/2},${(p._y+n._y)/2+30} ${n._x},${n._y-32}" stroke="#4a5a7a" stroke-width="2.2" fill="none"/>`;
      }
    });
    // Nodes
    nodes.forEach(n => {
      svgNodes += `
        <g class="bubble-node" data-id="${n.id}" style="cursor:pointer;">
          <circle cx="${n._x}" cy="${n._y}" r="32" fill="url(#bubble)" stroke="#6a7a9a" stroke-width="2.5"/>
          <clipPath id="clip${n.id}"><circle cx="${n._x}" cy="${n._y-8}" r="18"/></clipPath>
          <image xlink:href="${n.avatar}" x="${n._x-18}" y="${n._y-26}" width="36" height="36" clip-path="url(#clip${n.id})" style="filter: grayscale(0.2);"/>
          <text x="${n._x}" y="${n._y+16}" text-anchor="middle" font-size="13" fill="#fff" font-weight="600">${n.name}</text>
          <text x="${n._x}" y="${n._y+32}" text-anchor="middle" font-size="11" fill="#b0b8c1">${n.title}</text>
        </g>
      `;
    });
    html += `<svg width="${width}" height="${height}" style="overflow:visible;">
      <defs>
        <radialGradient id="bubble" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="#3a3f5a"/>
          <stop offset="100%" stop-color="#23283a"/>
        </radialGradient>
      </defs>
      ${svgEdges}
      ${svgNodes}
    </svg>`;
    leaderOverlayContent.innerHTML = html;
    // Make bubbles clickable (no-op for now)
    leaderOverlayContent.querySelectorAll('.bubble-node').forEach(node => {
      node.addEventListener('click', function(e) {
        // Placeholder for future action
        node.querySelector('circle').setAttribute('stroke', '#ffb347');
        setTimeout(()=>node.querySelector('circle').setAttribute('stroke', '#6a7a9a'), 300);
      });
    });
  }

  // SETTINGS BUTTON & MODAL (HTML-BASED, FULLY WIRED)
  // Use the HTML modal and button from index.html
  const settingsBtn = document.getElementById('settings-button');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-modal');
  const labelsSwitch = document.getElementById('labels-switch');

  // Show modal on settings button click
  if (settingsBtn && settingsModal) {
    settingsBtn.onclick = () => {
      settingsModal.style.display = 'flex';
      // Set toggle state from localStorage or default
      const labelsOn = localStorage.getItem('mapLabelsOn');
      if (labelsSwitch) labelsSwitch.checked = labelsOn === null ? true : labelsOn === 'true';
    };
  }
  // Hide modal on close button click
  if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.onclick = () => {
      settingsModal.style.display = 'none';
    };
  }
  // Hide modal when clicking outside modal content
  if (settingsModal) {
    settingsModal.onclick = (e) => {
      if (e.target === settingsModal) settingsModal.style.display = 'none';
    };
  }
  // --- LABELS TOGGLE LOGIC ---
  function setMapLabelsVisibility(show) {
    if (!map || !map.getStyle) return;
    const style = map.getStyle();
    if (!style || !style.layers) return;
    style.layers.forEach(layer => {
      if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
        if (map.getLayer(layer.id)) {
          map.setLayoutProperty(layer.id, 'visibility', show ? 'visible' : 'none');
        }
      }
    });
  }
  // Listen for toggle
  if (labelsSwitch) {
    labelsSwitch.onchange = function() {
      setMapLabelsVisibility(labelsSwitch.checked);
      localStorage.setItem('mapLabelsOn', labelsSwitch.checked);
    };
  }
  // Persist label toggle across style changes
  map.on('styledata', () => {
    const labelsOn = localStorage.getItem('mapLabelsOn');
    setMapLabelsVisibility(labelsOn === null ? true : labelsOn === 'true');
  });
  // Set initial label state after map load
  map.on('load', () => {
    const labelsOn = localStorage.getItem('mapLabelsOn');
    setMapLabelsVisibility(labelsOn === null ? true : labelsOn === 'true');
  });

  // --- Custom Calendar Rendering Logic ---
  // Google Calendar-like Full Functionality
  const calendarContainer = document.getElementById('custom-calendar');
  const calendarSidebar = document.getElementById('calendar-sidebar');
  const calendarHeader = document.getElementById('calendar-header');
  const calendarMain = document.getElementById('calendar-main');
  const calendarFab = document.getElementById('calendar-fab');
  const calendarModal = document.getElementById('calendar-modal');

  // --- Ensure calendarList exists ---
  window.calendarList = window.calendarList || [
    { id: 'default', name: 'Default', color: '#00e6ff', checked: true }
  ];
  const calendarList = window.calendarList;

  // --- Calendar Utility Functions ---
  function getToday() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }
  function getMonday(d) {
    d = new Date(d);
    const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }
  function pad(n) {
    return n < 10 ? '0' + n : n;
  }
  // --- Utility: Robust extraction for calendar cells ---
  function getDateHourFromCell(target) {
    // For week/month grid cells
    if (target.classList.contains('week-cell') || target.classList.contains('month-cell')) {
      const date = target.dataset.date || target.dataset.day;
      const hour = target.dataset.hour || '';
      return { date, hour };
    }
    // For week header (day names)
    if (target.classList.contains('week-day')) {
      const date = target.dataset.date || target.dataset.day;
      return { date, hour: '' };
    }
    // For week-hour (time column)
    if (target.classList.contains('week-hour')) {
      // Use selected day from state
      const { year, month, selectedDay } = calendarState || getToday();
      const date = `${year}-${pad(month+1)}-${pad(selectedDay)}`;
      const hour = target.dataset.hour || (target.textContent.match(/(\d{2})/) ? target.textContent.match(/(\d{2})/)[1] : '');
      return { date, hour };
    }
    return { date: '', hour: '' };
  }

  // --- Calendar Persistence ---
  let calendarEvents = [];
  function loadCalendarEvents() {
    try {
      const data = localStorage.getItem('calendarEvents');
      calendarEvents = data ? JSON.parse(data) : [];
    } catch (e) {
      calendarEvents = [];
    }
  }
  function saveCalendarEvents() {
    try {
      localStorage.setItem('calendarEvents', JSON.stringify(calendarEvents));
    } catch (e) {}
  }
  // --- Calendar Tabs Handler (no-op if not needed) ---
  function setupTabHandlers() {}

  // --- Calendar Rendering ---
  function renderGoogleCalendar() {
    if (!calendarModal) return;
    // Always re-query the calendar elements to ensure they exist
    const calendarSidebar = document.getElementById('calendar-sidebar');
    const calendarHeader = document.getElementById('calendar-header');
    const calendarMain = document.getElementById('calendar-main');
    if (!calendarSidebar || !calendarHeader || !calendarMain) return;
    if (!calendarState) {
      const today = getToday();
      calendarState = { 
        view: 'week', // 'week' or 'month'
        year: today.year, 
        month: today.month, 
        weekStart: getMonday(new Date(today.year, today.month, today.day)),
        selectedDay: today.day
      };
    }
    loadCalendarEvents();
    renderSidebar(calendarSidebar);
    renderHeader(calendarHeader);
    renderMain(calendarMain);
  }

  function renderSidebar(calendarSidebar) {
    if (!calendarSidebar) return;
    // Mini month calendar
    const year = calendarState.year;
    const month = calendarState.month;
    const today = getToday();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let miniMonth = `<div class="mini-month">
      <div class="mini-header">
        <button id="mini-prev" class="mini-nav">&#8592;</button>
        <span>${year}. ${pad(month+1)}</span>
        <button id="mini-next" class="mini-nav">&#8594;</button>
      </div>
      <div class="mini-grid">
        <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>`;
    let day = 1;
    for (let i = 0; i < 42; i++) {
      if (i < (firstDay === 0 ? 6 : firstDay-1) || day > daysInMonth) {
        miniMonth += '<div></div>';
      } else {
        const isToday = year === today.year && month === today.month && day === today.day;
        miniMonth += `<div class="mini-day${isToday ? ' mini-today' : ''}${calendarState.selectedDay===day?' mini-selected':''}" data-day="${day}">${day}</div>`;
        day++;
      }
    }
    miniMonth += '</div></div>';
    // Calendar list
    let calList = '<div class="calendar-list">';
    for (const cal of calendarList) {
      calList += `<label class="calendar-checkbox"><input type="checkbox" data-cal="${cal.id}"${cal.checked?' checked':''}><span class="cal-color" style="background:${cal.color}"></span>${cal.name}</label>`;
    }
    calList += '</div>';
    // Create button
    let createBtn = '<button id="sidebar-create-btn" class="sidebar-create">+ Create</button>';
    calendarSidebar.innerHTML = miniMonth + calList + createBtn;
    // Mini month navigation
    document.getElementById('mini-prev').onclick = () => {
      if (calendarState.month === 0) {
        calendarState.year--;
        calendarState.month = 11;
      } else {
        calendarState.month--;
      }
      renderGoogleCalendar();
    };
    document.getElementById('mini-next').onclick = () => {
      if (calendarState.month === 11) {
        calendarState.year++;
        calendarState.month = 0;
      } else {
        calendarState.month++;
      }
      renderGoogleCalendar();
    };
    // Mini day select
    calendarSidebar.querySelectorAll('.mini-day').forEach(el => {
      el.onclick = function() {
        calendarState.selectedDay = +el.dataset.day;
        calendarState.year = year;
        calendarState.month = month;
        if (calendarState.view === 'week') {
          const d = new Date(year, month, +el.dataset.day);
          calendarState.weekStart = getMonday(d);
        }
        renderGoogleCalendar(); // Always re-render after day select
      };
    });
    // Calendar list toggle
    calendarSidebar.querySelectorAll('input[type=checkbox][data-cal]').forEach(cb => {
      cb.onchange = function() {
        const cal = calendarList.find(c => c.id === cb.dataset.cal);
        if (cal) cal.checked = cb.checked;
        renderGoogleCalendar();
      };
    });
    // Create button
    const sidebarCreateBtn = document.getElementById('sidebar-create-btn');
    if (sidebarCreateBtn) sidebarCreateBtn.onclick = openEventModal;
  }

  function renderHeader(calendarHeader) {
    if (!calendarHeader) return;
    let label = '';
    if (calendarState.view === 'week') {
      const start = new Date(calendarState.weekStart);
      const end = new Date(start); end.setDate(start.getDate()+6);
      label = `${start.getFullYear()}. ${pad(start.getMonth()+1)}. ${pad(start.getDate())} - ${end.getFullYear()}. ${pad(end.getMonth()+1)}. ${pad(end.getDate())}`;
    } else {
      label = `${calendarState.year}. ${pad(calendarState.month+1)}`;
    }
    calendarHeader.innerHTML = `
      <button id="cal-today" class="cal-nav">Today</button>
      <button id="cal-prev" class="cal-nav">&#8592;</button>
      <span class="cal-label">${label}</span>
      <button id="cal-next" class="cal-nav">&#8594;</button>
      <div class="cal-view-switch">
        <button id="view-week" class="${calendarState.view==='week'?'active':''}">Week</button>
        <button id="view-month" class="${calendarState.view==='month'?'active':''}">Month</button>
      </div>
    `;
    document.getElementById('cal-today').onclick = () => {
      const today = getToday();
      calendarState.year = today.year;
      calendarState.month = today.month;
      calendarState.selectedDay = today.day;
      calendarState.weekStart = getMonday(new Date(today.year, today.month, today.day));
      renderGoogleCalendar();
    };
    document.getElementById('cal-prev').onclick = () => {
      if (calendarState.view === 'week') {
        const d = new Date(calendarState.weekStart);
        d.setDate(d.getDate()-7);
        calendarState.weekStart = getMonday(d);
        calendarState.year = d.getFullYear();
        calendarState.month = d.getMonth();
        calendarState.selectedDay = d.getDate();
      } else {
        if (calendarState.month === 0) {
          calendarState.year--;
          calendarState.month = 11;
        } else {
          calendarState.month--;
        }
        calendarState.selectedDay = 1;
      }
      renderGoogleCalendar();
    };
    document.getElementById('cal-next').onclick = () => {
      if (calendarState.view === 'week') {
        const d = new Date(calendarState.weekStart);
        d.setDate(d.getDate()+7);
        calendarState.weekStart = getMonday(d);
        calendarState.year = d.getFullYear();
        calendarState.month = d.getMonth();
        calendarState.selectedDay = d.getDate();
      } else {
        if (calendarState.month === 11) {
          calendarState.year++;
          calendarState.month = 0;
        } else {
          calendarState.month++;
        }
        calendarState.selectedDay = 1;
      }
      renderGoogleCalendar();
    };
    document.getElementById('view-week').onclick = () => {
      calendarState.view = 'week';
      const d = new Date(calendarState.year, calendarState.month, calendarState.selectedDay);
      calendarState.weekStart = getMonday(d);
      renderGoogleCalendar();
    };
    document.getElementById('view-month').onclick = () => {
      calendarState.view = 'month';
      renderGoogleCalendar();
    };
  }

  function renderMain(calendarMain) {
    if (!calendarMain) return;
    if (calendarState.view === 'week') {
      renderWeekView(calendarMain);
    } else {
      renderMonthView(calendarMain);
    }
    delegateCalendarClicks();
  }

  function delegateCalendarClicks() {
    const main = document.getElementById('calendar-main');
    if (!main) return;
    main.onclick = function(e) {
      let target = e.target;
      // Traverse up to find a cell with a relevant class
      while (target && target !== main && !target.classList.contains('week-cell') && !target.classList.contains('month-cell') && !target.classList.contains('week-day') && !target.classList.contains('week-hour')) {
        target = target.parentElement;
      }
      if (!target || target === main) return;
      const { date, hour } = getDateHourFromCell(target);
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // Use mouse position for popup
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        openQuickEventAdder(date, hour, mouseX, mouseY);
      } else {
        console.error('Invalid date extracted from calendar cell:', date, target);
      }
    };
  }

  function renderWeekView(calendarMain) {
    // Days header
    const start = new Date(calendarState.weekStart);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate()+i);
      days.push(d);
    }
    // Render header as 8-column grid (time + 7 days)
    let html = '<div class="week-header" style="display:grid;grid-template-columns:60px repeat(7,1fr);">';
    html += '<div class="week-hour-header"></div>'; // Time column header (empty)
    const weekDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    for (let i = 0; i < 7; i++) {
      const d = days[i];
      const isToday = d.getFullYear()===getToday().year && d.getMonth()===getToday().month && d.getDate()===getToday().day;
      html += `<div class="week-day${isToday?' week-today':''}" data-date="${d.toISOString().slice(0,10)}">` +
        `<div class="week-day-label">${weekDays[i]}</div>` +
        `<div class="week-day-num">${d.getDate()}</div></div>`;
    }
    html += '</div>';
    // Render grid as 8-column grid (time + 7 days)
    html += '<div class="week-grid" style="display:grid;grid-template-columns:60px repeat(7,1fr);position:relative;">';
    for (let h = 7; h <= 22; h++) {
      html += `<div class="week-hour" data-hour="${h}">${pad(h)}:00</div>`;
      for (let d = 0; d < 7; d++) {
        html += `<div class="week-cell" data-date="${days[d].toISOString().slice(0,10)}" data-hour="${h}"></div>`;
      }
    }
    html += '</div>';
    calendarMain.innerHTML = html;
    // Overlay: always remove any existing overlay first
    const weekGrid = calendarMain.querySelector('.week-grid');
    if (weekGrid) {
      const oldOverlay = weekGrid.querySelector('.calendar-column-overlay');
      if (oldOverlay) oldOverlay.remove();
      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'calendar-column-overlay';
      // Add empty cell for time column
      const empty = document.createElement('div');
      overlay.appendChild(empty);
      // Add overlays for each day column
      for (let i = 0; i < 7; i++) {
        const d = days[i];
        const isToday = d.getFullYear()===getToday().year && d.getMonth()===getToday().month && d.getDate()===getToday().day;
        const col = document.createElement('div');
        col.className = 'column-overlay' + (isToday ? ' column-today' : '');
        col.style.gridColumn = (i+2).toString(); // skip time column
        col.style.gridRow = '1 / -1';
        // For debugging, use a visible color:
        col.style.background = isToday ? 'rgba(0,230,255,0.08)' : 'rgba(255,0,0,0.08)';
        overlay.appendChild(col);
      }
      weekGrid.appendChild(overlay);
      weekGrid.style.position = 'relative';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '10';
    }
    // Make week grid scrollable if needed
    if (weekGrid) {
      weekGrid.style.overflowY = 'auto';
      weekGrid.style.maxHeight = 'calc(100vh - 110px)';
    }
  }

  function renderMonthView(calendarMain) {
    const year = calendarState.year;
    const month = calendarState.month;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '<div class="month-grid">';
    let day = 1;
    for (let i = 0; i < 42; i++) {
      if (i < (firstDay === 0 ? 6 : firstDay-1) || day > daysInMonth) {
        html += '<div class="month-cell"></div>';
      } else {
        const isToday = year === getToday().year && month === getToday().month && day === getToday().day;
        html += `<div class="month-cell${isToday?' month-today':''}" data-date="${year}-${pad(month+1)}-${pad(day)}">${day}<div class="month-events"></div></div>`;
        day++;
      }
    }
    html += '</div>';
    calendarMain.innerHTML = html;
    renderEvents('month', null, calendarMain);
  }

  function renderEvents(view, days, calendarMain) {
    // Clear all event cells before rendering
    if (view === 'week') {
      calendarMain.querySelectorAll('.week-cell').forEach(cell => cell.innerHTML = '');
    } else {
      calendarMain.querySelectorAll('.month-events').forEach(cell => cell.innerHTML = '');
    }
    // Only show events for checked calendars
    const activeCals = calendarList.filter(c => c.checked).map(c => c.id);
    if (view === 'week') {
      for (const ev of calendarEvents) {
        if (!activeCals.includes(ev.calendar)) continue;
        const evDate = ev.date;
        const evHour = ev.hour;
        // FIX: use data-date, not data-day
        const cell = calendarMain.querySelector(`.week-cell[data-date="${evDate}"][data-hour="${evHour}"]`);
        if (cell) {
          const cal = calendarList.find(c => c.id === ev.calendar);
          cell.innerHTML += `<div class="event-chip" style="background:${cal?cal.color:'#00e6ff'}20;position:relative;display:flex;align-items:center;cursor:pointer;" data-id="${ev.id}" title="${ev.link?ev.link:''}">
          <span style="display:inline-block;width:6px;height:80%;background:${cal?cal.color:'#00e6ff'};border-radius:3px;margin-right:7px;"></span>
          <span style="flex:1;">${ev.title || '(No title)'}${ev.link?'<a href="'+ev.link+'" target="_blank" style="margin-left:6px;color:#fff;text-decoration:none;" title="Open link">🔗</a>':''}</span>
        </div>`;
        }
      }
      // Event click
      calendarMain.querySelectorAll('.event-chip').forEach(chip => {
        chip.onclick = function(e) {
          e.stopPropagation();
          // Show overlay box for this event
          const ev = calendarEvents.find(ev => ev.id === chip.dataset.id);
          if (ev) showEventOverlay(ev, chip);
        };
      });
    } else {
      // Month view: show events as chips in each day
      for (const ev of calendarEvents) {
        if (!activeCals.includes(ev.calendar)) continue;
        const cell = calendarMain.querySelector(`.month-cell[data-date="${ev.date}"] .month-events`);
        if (cell) {
          const cal = calendarList.find(c => c.id === ev.calendar);
          cell.innerHTML += `<div class="event-chip" style="background:${cal?cal.color:'#00e6ff'}20;position:relative;display:flex;align-items:center;" data-id="${ev.id}" title="${ev.link?ev.link:''}">
            <span style="display:inline-block;width:6px;height:80%;background:${cal?cal.color:'#00e6ff'};border-radius:3px;margin-right:7px;"></span>
            <span style="flex:1;">${ev.title}${ev.link?'<a href="'+ev.link+'" target="_blank" style="margin-left:6px;color:#fff;text-decoration:none;" title="Open link">🔗</a>':''}</span>
          </div>`;
        }
      }
      calendarMain.querySelectorAll('.event-chip').forEach(chip => {
        chip.onclick = function(e) {
          e.stopPropagation();
          // Show overlay box for this event
          const ev = calendarEvents.find(ev => ev.id === chip.dataset.id);
          if (ev) showEventOverlay(ev, chip);
        };
      });
    }
  }

  // --- Event Modal (Create/Edit) ---
  let eventModal = null;
  function openEventModal(date, hour, eventId) {
    if (!eventModal || !document.body.contains(eventModal)) {
      eventModal = document.createElement('div');
      eventModal.className = 'event-modal';
      eventModal.style.zIndex = '10060';
      eventModal.innerHTML = `<div class="event-modal-content">
        <span class="event-modal-close">&times;</span>
        <h2 id="event-modal-title">New Event</h2>
        <form id="event-form">
          <label>Title<input type="text" id="event-title" required></label>
          <label>Calendar<select id="event-calendar"></select></label>
          <label>Date<input type="date" id="event-date" required></label>
          <label>Hour<select id="event-hour"></select></label>
          <label>Link<input type="url" id="event-link" placeholder="https://example.com"></label>
          <label>Description<textarea id="event-desc"></textarea></label>
          <div class="event-modal-actions">
            <button type="submit" id="event-save">Save</button>
            <button type="button" id="event-delete" style="display:none">Delete</button>
          </div>
        </form>
      </div>`;
      document.body.appendChild(eventModal);
      eventModal.querySelector('.event-modal-close').onclick = () => eventModal.style.display = 'none';
      eventModal.onclick = (e) => { if (e.target === eventModal) eventModal.style.display = 'none'; };
    }
    // Populate form
    const form = eventModal.querySelector('#event-form');
    const title = eventModal.querySelector('#event-title');
    const calSel = eventModal.querySelector('#event-calendar');
    const dateInput = eventModal.querySelector('#event-date');
    const hourSel = eventModal.querySelector('#event-hour');
    const linkInput = eventModal.querySelector('#event-link');
    const desc = eventModal.querySelector('#event-desc');
    const delBtn = eventModal.querySelector('#event-delete');
    const modalTitle = eventModal.querySelector('#event-modal-title');
    // Fill calendar options
    calSel.innerHTML = calendarList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    // Fill hour options
    hourSel.innerHTML = '<option value="">--</option>' + Array.from({length:16},(_,i)=>7+i).map(h=>`<option value="${h}">${pad(h)}:00</option>`).join('');
    let editing = false, ev = null;
    if (eventId) {
      ev = calendarEvents.find(e => e.id === eventId);
      if (ev) {
        editing = true;
        title.value = ev.title;
        calSel.value = ev.calendar;
        dateInput.value = ev.date;
        hourSel.value = ev.hour || '';
        linkInput.value = ev.link || '';
        desc.value = ev.desc || '';
        delBtn.style.display = '';
        modalTitle.textContent = 'Edit Event';
      }
    } else {
      title.value = '';
      calSel.value = calendarList[0].id;
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateInput.value = date;
      } else {
        dateInput.value = '';
        if (date) console.error('Invalid date passed to openEventModal:', date);
      }
      hourSel.value = hour ? hour : '';
      linkInput.value = '';
      desc.value = '';
      delBtn.style.display = 'none';
      modalTitle.textContent = 'New Event';
    }
    eventModal.style.display = 'flex';
    setTimeout(() => title.focus(), 100);
    // Save
    form.onsubmit = function(e) {
      e.preventDefault();
      if (editing) {
        ev.title = title.value;
        ev.calendar = calSel.value;
        ev.date = dateInput.value;
        ev.hour = hourSel.value;
        ev.link = linkInput.value;
        ev.desc = desc.value;
      } else {
        const id = 'ev'+Date.now();
        calendarEvents.push({
          id,
          title: title.value,
          calendar: calSel.value,
          date: dateInput.value,
          hour: hourSel.value,
          link: linkInput.value,
          desc: desc.value
        });
      }
      saveCalendarEvents();
      eventModal.style.display = 'none';
      renderGoogleCalendar();
    };
    // Delete
    delBtn.onclick = function() {
      if (editing && ev) {
        calendarEvents = calendarEvents.filter(e => e.id !== ev.id);
        saveCalendarEvents();
        eventModal.style.display = 'none';
        renderGoogleCalendar();
      }
    };
  }

  // FAB logic
  if (calendarFab) {
    calendarFab.onclick = () => openEventModal();
  }

  // Remove transitionend event for calendar modal (no longer needed)
  // Ensure calendar renders when modal opens via direct call only
  // === Calendar Widget and Modal Handlers (MUST be at the end of DOMContentLoaded) ===
  const calendarWidget = document.getElementById('calendar-widget');
  if (calendarWidget && calendarModal) {
    calendarWidget.onclick = () => {
      renderGoogleCalendar();
      calendarModal.style.display = 'flex';
    };
  }
  // F2 handler: always render before showing
  window.addEventListener('keydown', function(e) {
    if (e.key === 'F2') {
      renderGoogleCalendar();
      calendarModal.style.display = 'flex';
      calendarModal.style.zIndex = '10050';
    }
    // ESC key closes calendar modal if open
    if (e.key === 'Escape' && calendarModal && calendarModal.style.display === 'flex') {
      calendarModal.style.display = 'none';
    }
  });
  // Close button
  const closeCalendarBtn = document.getElementById('close-calendar-modal');
  if (closeCalendarBtn && calendarModal) {
    closeCalendarBtn.onclick = () => {
      calendarModal.style.display = 'none';
    };
  }
  // Hide calendar modal when clicking outside its content
  if (calendarModal) {
    calendarModal.addEventListener('mousedown', function(e) {
      if (e.target === calendarModal) {
        calendarModal.style.display = 'none';
      }
    });
  }
  // Ensure calendar modal is hidden on load
  if (calendarModal) calendarModal.style.display = 'none';

  // === DEBUG: Global error handler ===
  window.addEventListener('error', function(e) {
    console.error('Global JS Error:', e.message, e.filename, e.lineno, e.colno, e.error);
  });

  // --- Quick Event Adder Logic ---
  function openQuickEventAdder(date, hour, mouseX, mouseY) {
    // Remove any existing quick adder
    let quickAdder = document.getElementById('quick-event-adder');
    if (quickAdder) quickAdder.remove();
    quickAdder = document.createElement('div');
    quickAdder.id = 'quick-event-adder';
    quickAdder.style.position = 'fixed';
    quickAdder.style.zIndex = '10070';
    quickAdder.innerHTML = `
      <button id="quick-close" style="position:absolute;top:8px;right:12px;background:none;border:none;color:#00e6ff;font-size:1.5em;cursor:pointer;">&times;</button>
      <input id="quick-title" type="text" placeholder="Add title" style="font-size:1.1em;padding:8px 10px;border-radius:6px;border:1px solid #00e6ff;background:#181c2a;color:#e0e0e0;outline:none;">
      <div style="display:flex;gap:10px;align-items:center;">
        <input id="quick-date" type="date" style="padding:6px 8px;border-radius:6px;border:1px solid #00e6ff;background:#181c2a;color:#e0e0e0;">
        <select id="quick-hour" style="padding:6px 8px;border-radius:6px;border:1px solid #00e6ff;background:#181c2a;color:#e0e0e;">
          <option value="">--</option>
          ${Array.from({length:16},(_,i)=>7+i).map(h=>`<option value="${h}">${pad(h)}:00</option>`).join('')}
        </select>
      </div>
      <input id="quick-link" type="url" placeholder="Link (optional)" style="font-size:1em;padding:8px 10px;border-radius:6px;border:1px solid #00e6ff;background:#181c2a;color:#e0e0e0;outline:none;margin-top:6px;">
      <textarea id="quick-desc" placeholder="Description (optional)" style="font-size:1em;padding:8px 10px;border-radius:6px;border:1px solid #00e6ff;background:#181c2a;color:#e0e0e0;resize:vertical;min-height:40px;"></textarea>
      <div id="quick-summary" style="background:#202436;border-radius:8px;padding:10px 12px;margin:8px 0 0 0;color:#b0eaff;font-size:1em;display:none;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;">
        <button id="quick-more" style="background:#23283a;color:#00e6ff;border:1.5px solid #00e6ff;">More options</button>
        <button id="quick-save" style="background:#00e6ff;color:#23283a;">Save</button>
      </div>
    `;
    quickAdder.style.left = (mouseX+10)+'px';
    quickAdder.style.top = (mouseY-10)+'px';
    document.body.appendChild(quickAdder);
    // Set values
    quickAdder.querySelector('#quick-date').value = date || '';
    quickAdder.querySelector('#quick-hour').value = hour || '';
    // Show summary as user types
    function updateSummary() {
      const title = quickAdder.querySelector('#quick-title').value.trim();
      const dateVal = quickAdder.querySelector('#quick-date').value;
      const hourVal = quickAdder.querySelector('#quick-hour').value;
      const link = quickAdder.querySelector('#quick-link').value.trim();
      const desc = quickAdder.querySelector('#quick-desc').value.trim();
      let summary = '';
      if (title || dateVal || hourVal || link || desc) {
        summary = `<b>${title || '(No title)'}</b><br>`;
        if (dateVal) summary += `${dateVal}`;
        if (hourVal) summary += ` ${pad(hourVal)}:00`;
        if (link) summary += `<br><a href='${link}' target='_blank' style='color:#00e6ff;'>${link}</a>`;
        if (desc) summary += `<br>${desc}`;
        quickAdder.querySelector('#quick-summary').style.display = '';
        quickAdder.querySelector('#quick-summary').innerHTML = summary;
      } else {
        quickAdder.querySelector('#quick-summary').style.display = 'none';
        quickAdder.querySelector('#quick-summary').innerHTML = '';
      }
    }
    quickAdder.querySelector('#quick-title').addEventListener('input', updateSummary);
    quickAdder.querySelector('#quick-date').addEventListener('input', updateSummary);
    quickAdder.querySelector('#quick-hour').addEventListener('input', updateSummary);
    quickAdder.querySelector('#quick-link').addEventListener('input', updateSummary);
    quickAdder.querySelector('#quick-desc').addEventListener('input', updateSummary);
    // Initial summary
    updateSummary();
    // Close button
    quickAdder.querySelector('#quick-close').onclick = function() {
      quickAdder.remove();
    };
    // More options button
    quickAdder.querySelector('#quick-more').onclick = function() {
      quickAdder.remove();
      openEventModal(date, hour);
    };
    // Save button
    quickAdder.querySelector('#quick-save').onclick = function() {
      const title = quickAdder.querySelector('#quick-title').value.trim();
      const dateVal = quickAdder.querySelector('#quick-date').value;
      const hourVal = quickAdder.querySelector('#quick-hour').value;
      const link = quickAdder.querySelector('#quick-link').value.trim();
      const desc = quickAdder.querySelector('#quick-desc').value.trim();
      if (!title || !dateVal) {
        alert('Title and date are required.');
        return;
      }
      // Ensure calendar is set to the first checked calendar, fallback to default
      let calId = (calendarList.find(c => c.checked) || calendarList[0]).id;
      const id = 'ev'+Date.now();
      calendarEvents.push({
        id,
        title,
        calendar: calId,
        date: dateVal,
        hour: hourVal,
        link,
        desc
      });
      saveCalendarEvents();
      quickAdder.remove();
      renderGoogleCalendar();
    };
    // Prevent overlay from blocking map clicks unless interacting with it
    quickAdder.addEventListener('mousedown', function(e) {
      e.stopPropagation();
    });
    quickAdder.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // Overlay function
  function showEventOverlay(ev, anchorEl) {
    // Remove any existing overlay
    document.querySelectorAll('.calendar-event-overlay').forEach(el => el.remove());
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'calendar-event-overlay';
    overlay.style.position = 'absolute';
    overlay.style.minWidth = '220px';
    overlay.style.background = '#23283a';
    overlay.style.color = '#fff';
    overlay.style.border = '2px solid #00e6ff';
    overlay.style.borderRadius = '10px';
    overlay.style.boxShadow = '0 4px 24px #00e6ff44';
    overlay.style.padding = '16px';
    overlay.style.zIndex = '10080';
    overlay.style.fontSize = '1em';
    overlay.innerHTML = `
      <div style="font-weight:600;font-size:1.1em;margin-bottom:6px;">${ev.title || '(No title)'}</div>
      <div style="color:#00e6ff;font-size:0.98em;margin-bottom:4px;">${ev.date} ${ev.hour?pad(ev.hour)+':00':''}</div>
      ${ev.link?`<div style='margin-bottom:4px;'><a href='${ev.link}' target='_blank' style='color:#00e6ff;text-decoration:underline;'>${ev.link}</a></div>`:''}
      ${ev.desc?`<div style='margin-bottom:4px;'>${ev.desc}</div>`:''}
      <button style="margin-top:8px;padding:6px 14px;background:#00e6ff;color:#23283a;border:none;border-radius:6px;cursor:pointer;font-weight:600;" onclick="this.parentNode.remove()">Close</button>
    `;
    // Position overlay near the anchor element
    const rect = anchorEl.getBoundingClientRect();
    // Try to keep overlay inside the viewport
    let top = window.scrollY + rect.bottom + 6;
    let left = window.scrollX + rect.left;
    if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
    if (top + 180 > window.innerHeight) top = window.innerHeight - 190;
    overlay.style.top = top + 'px';
    overlay.style.left = left + 'px';
    overlay.style.position = 'fixed'; // Use fixed to avoid scroll issues
    overlay.tabIndex = 0;
    overlay.style.display = 'block';
    overlay.style.pointerEvents = 'auto';
    overlay.style.opacity = '1';
    setTimeout(() => {
      overlay.focus && overlay.focus();
    }, 10);
    document.body.appendChild(overlay);
  }

  // Point Info Card Functionality
  let pointInfoCard = document.getElementById('point-info-card');
  let closePointInfo = document.getElementById('close-point-info');
  let pointTitle = document.getElementById('point-title');
  let pointContent = document.getElementById('point-content');

  function showPointInfo(feature) {
    if (!pointInfoCard || !pointTitle || !pointContent) return;
    // Set title
    pointTitle.textContent = feature.properties && feature.properties.name ? feature.properties.name : 'Point Information';
    // Build content
    let contentHTML = '';
    for (const [key, value] of Object.entries(feature.properties)) {
      if (key !== 'name' && value) {
        contentHTML += `<div class='data-row'><span class='label'>${key.replace(/_/g, ' ').toUpperCase()}</span> <span class='value'>${value}</span></div>`;
      }
    }
    pointContent.innerHTML = contentHTML || '<em>No details available.</em>';
    pointInfoCard.style.display = 'block';
    pointInfoCard.classList.remove('hiding');
  }

  function hidePointInfo() {
    if (!pointInfoCard) return;
    pointInfoCard.classList.add('hiding');
    setTimeout(() => {
      pointInfoCard.style.display = 'none';
      pointInfoCard.classList.remove('hiding');
    }, 300);
  }

  if (closePointInfo) closePointInfo.onclick = hidePointInfo;

  // Attach point click handler robustly after map and layers are loaded
  map.on('load', async () => {
    // ...existing code...
    await loadData();
    // ...existing code...
    // Attach point click handler after layers are loaded
    // List of point layers to trigger info card (use dynamic layer names)
    const pointLayers = [
      'ports-points', 'oil_fields-points', 'nuclear-points', 'pipelines-points', 'powerlines-points', 'refineries-points', 'industrial_zones-points', 'trade_zones-points', 'military-base-points'
    ];

    map.on('click', (e) => {
      // Only query features from point layers
      const features = map.queryRenderedFeatures(e.point, { layers: pointLayers });
      if (features && features.length > 0) {
        showPointInfo(features[0]);
      } else {
        hidePointInfo(); // Hide info card if not clicking a point
      }
    });
  });

  // --- Map Click Handler: Show info card for valid point features ---
  map.on('click', function(e) {
    const features = map.queryRenderedFeatures(e.point);
    if (!features || !features.length) {
      if (pointInfoCard) pointInfoCard.style.display = 'none';
      return;
    }
    // Log all features for debugging
    console.log('Clicked features:', features.map(f => ({layer: f.layer && f.layer.id, type: f.geometry && f.geometry.type, properties: f.properties})));
    // List of allowed point layers (update these to match your actual layer IDs)
    const allPointLayers = [
      'ports-points', 'oil_fields-points', 'nuclear-points', 'refineries-points', 'pipelines-points', 'industrial_zones-points', 'trade_zones-points', 'powerlines-points', 'military-base-points'
    ];
    // Get available layers from map style
    const styleLayers = (map.getStyle && map.getStyle().layers) ? map.getStyle().layers.map(l => l.id) : [];
    const pointLayers = allPointLayers.filter(l => styleLayers.includes(l));
    // Find first feature from a point layer AND geometry type Point
    const pointFeature = features.find(f => f.layer && pointLayers.includes(f.layer.id) && f.geometry && f.geometry.type === 'Point');
    if (pointFeature) {
      showPointInfo(pointFeature);
      if (pointInfoCard) {
        if (!window.forceShowPointInfo) pointInfoCard.style.display = 'flex';
      }
    } else {
      if (pointInfoCard && !window.forceShowPointInfo) pointInfoCard.style.display = 'none';
    }
  });
});
/* Add this to your CSS (style.css or in a <style> block):
.calendar-column-overlay { pointer-events: none; z-index: 10; position: absolute; inset: 0; display: grid; grid-template-columns: 60px repeat(7,1fr); }
.column-overlay { transition: background 0.2s; grid-row: 1 / -1; }
.column-today { background: rgba(0,230,255,0.08) !important; }
*/