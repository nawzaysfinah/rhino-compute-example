// Import libraries
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import rhino3dm from 'rhino3dm';
import { RhinoCompute } from 'rhinocompute';

document.addEventListener('DOMContentLoaded', async () => {
    const definitionName = 'BranchNodeRnd.gh';

    // Set up sliders
    const radius_slider = document.getElementById('radius');
    const length_slider = document.getElementById('length');
    const count_slider = document.getElementById('count');
    const height_slider = document.getElementById('height');

    radius_slider.addEventListener('mouseup', onSliderChange, false);
    radius_slider.addEventListener('touchend', onSliderChange, false);
    length_slider.addEventListener('mouseup', onSliderChange, false);
    length_slider.addEventListener('touchend', onSliderChange, false);
    count_slider.addEventListener('mouseup', onSliderChange, false);
    count_slider.addEventListener('touchend', onSliderChange, false);
    // height_slider.addEventListener('mouseup', onSliderChange, false);
    // height_slider.addEventListener('touchend', onSliderChange, false);

    let definition;
    let scene, camera, renderer, controls;

    const rhino = await rhino3dm();
    console.log('Loaded rhino3dm.');

    RhinoCompute.url = 'http://localhost:6500/'; // Local RhinoCompute server URL
    RhinoCompute.apiKey = ''; // Leave blank for local debugging

    // load a grasshopper file
    const url = definitionName;
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const arr = new Uint8Array(buffer);
    definition = arr;

    initThreeJS();
    compute();

    async function compute() {
        const param1 = new RhinoCompute.Grasshopper.DataTree('Length');
        param1.append([0], [length_slider.valueAsNumber]);

        const param2 = new RhinoCompute.Grasshopper.DataTree('Radius');
        param2.append([0], [radius_slider.valueAsNumber]);

        const param3 = new RhinoCompute.Grasshopper.DataTree('Count');
        param3.append([0], [count_slider.valueAsNumber]);


        // clear values
        const trees = [];
        trees.push(param1);
        trees.push(param2);
        trees.push(param3);

        const res = await RhinoCompute.Grasshopper.evaluateDefinition(definition, trees);

        console.log(res);

        // hide spinner
        document.getElementById('loader').style.display = 'none';

        // get the b64 mesh output
        const data = JSON.parse(res.values[1].InnerTree['{0}'][0].data);
        const mesh = rhino.DracoCompression.decompressBase64String(data);

        const material = new THREE.MeshNormalMaterial();
        const threeMesh = meshToThreejs(mesh, material);

        // clear the scene
        scene.traverse(child => {
            if (child.isMesh) {
                scene.remove(child);
            }
        });

        scene.add(threeMesh);
    }

    function onSliderChange() {
        // show spinner
        document.getElementById('loader').style.display = 'block';
        compute();
    }

    function getAuth(key) {
        let value = localStorage[key];
        if (value === undefined) {
            const prompt = key.includes('URL') ? 'Server URL' : 'Server API Key';
            value = window.prompt('RhinoCompute ' + prompt);
            if (value !== null) {
                localStorage.setItem(key, value);
            }
        }
        return value;
    }

    // BOILERPLATE //

    function initThreeJS() {
        // Rhino models are z-up, so set this as the default
        THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(1, 1, 1);
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
        camera.position.z = 50;

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(document.getElementById('model').clientWidth, document.getElementById('model').clientHeight);
        document.getElementById('3d-model').appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);

        window.addEventListener('resize', onWindowResize, false);

        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    function onWindowResize() {
        camera.aspect = document.getElementById('model').clientWidth / document.getElementById('model').clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(document.getElementById('model').clientWidth, document.getElementById('model').clientHeight);
        animate();
    }

    function meshToThreejs(mesh, material) {
        const loader = new THREE.BufferGeometryLoader();
        const geometry = loader.parse(mesh.toThreejsJSON());
        return new THREE.Mesh(geometry, material);
    }
});
