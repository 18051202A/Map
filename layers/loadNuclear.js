function loadNuclearLayer(map) {
    console.log('☢️ Nuclear button clicked');
  
    if (!map.getSource('nuclear')) {
      fetch('Data/nuclear.json')
        .then(response => response.json())
        .then(data => {
          map.addSource('nuclear', {
            type: 'geojson',
            data: data
          });
  
          map.addLayer({
            id: 'nuclear-layer',
            type: 'circle',
            source: 'nuclear',
            paint: {
              'circle-radius': 6,
              'circle-color': '#ffcc00',
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff'
            }
          });
        });
    }
  }
  
  