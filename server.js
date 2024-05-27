const express = require('express');
const rhino3dm = require('rhino3dm');
const RhinoCompute = require('compute-rhino3d');

const app = express();
const port = 3000;

app.use(express.static('public'));

rhino3dm().then((rhino) => {
  console.log('Loaded rhino3dm.');

  RhinoCompute.url = 'http://localhost:6500/';

  app.get('/compute', async (req, res) => {
    const definitionName = 'spiky_thing.gh';
    const params = {
      definition: definitionName,
      inputs: [
        { name: 'Frequency', value: req.query.frequency },
        { name: 'Size', value: req.query.size }
      ]
    };

    const response = await RhinoCompute.Grasshopper.evaluateDefinition(params);
    res.json(response);
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
  });
});