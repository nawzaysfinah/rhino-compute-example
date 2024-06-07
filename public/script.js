// Import libraries
import * as THREE from 'three';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import rhino3dm from 'rhino3dm';
import { RhinoCompute } from 'rhinocompute';
import { Rhino3dmLoader } from '../node_modules/three/examples/jsm/loaders/3DMLoader.js';
import { STLExporter } from '../node_modules/three/examples/jsm/exporters/STLExporter.js';

let data = {}
data.definition = "BranchNodeRnd.gh"
data.inputs = {
    'radius': null,
    'height': null,
    'offset': null,
}

document.addEventListener('DOMContentLoaded', async () => {
    // const definitionName = 'BranchNodeRnd.gh';

    // Set up sliders
    const radius_slider = document.getElementById('radius');
    const height_slider = document.getElementById('height');
    const offset_slider = document.getElementById('offset');
    const radius_value = document.getElementById('radius-value');
    const height_value = document.getElementById('height-value');
    const offset_value = document.getElementById('offset-value');

    radius_slider.addEventListener('input', () => {
        radius_value.textContent = radius_slider.value;
    });
    height_slider.addEventListener('input', () => {
        height_value.textContent = height_slider.value;
    });
    offset_slider.addEventListener('input', () => {
        offset_value.textContent = offset_slider.value;
    });

    radius_slider.addEventListener('mouseup', onSliderChange, false);
    radius_slider.addEventListener('touchend', onSliderChange, false);
    height_slider.addEventListener('mouseup', onSliderChange, false);
    height_slider.addEventListener('touchend', onSliderChange, false);
    offset_slider.addEventListener('mouseup', onSliderChange, false);
    offset_slider.addEventListener('touchend', onSliderChange, false);

    // make download button
    const downloadButton = document.getElementById("downloadButton")
    downloadButton.onclick = download

    // globals
    let definition, doc;
    let scene, camera, renderer, controls;

    const rhino = await rhino3dm();
    console.log('Loaded rhino3dm.');

    RhinoCompute.url = 'http://localhost:6500/'; // Local RhinoCompute server URL
    RhinoCompute.apiKey = ''; // Leave blank for local debugging

    // load a grasshopper file
    const url = data.definition;
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    definition = new Uint8Array(buffer);

    // enable download button
    downloadButton.disabled = false

    initThreeJS();
    compute();

    async function compute() {
        const param1 = new RhinoCompute.Grasshopper.DataTree('Height');
        param1.append([0], [height_slider.valueAsNumber]);

        const param2 = new RhinoCompute.Grasshopper.DataTree('Radius');
        param2.append([0], [radius_slider.valueAsNumber]);

        const param3 = new RhinoCompute.Grasshopper.DataTree('Offset');
        param3.append([0], [offset_slider.valueAsNumber]);

        // add all params to an array & clear values
        const trees = [];
        trees.push(param1);
        trees.push(param2);
        trees.push(param3);

        // call RhinoCompute
        const res = await RhinoCompute.Grasshopper.evaluateDefinition(definition, trees);

        console.log(res);

        collectResults(res)

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

    /**
     * Parse response
     */
    function collectResults(responseJson) {
        const values = responseJson.values;

        // clear doc
        if (doc !== undefined) {
            doc.delete();
        }

        doc = new rhino.File3dm();

        // for each output (RH_OUT:*)...
        for (let i = 0; i < values.length; i++) {
            // ...iterate through data tree structure...
            for (const path in values[i].InnerTree) {
                const branch = values[i].InnerTree[path];
                // ...and for each branch...
                for (let j = 0; j < branch.length; j++) {
                    // ...load rhino geometry into doc
                    const rhinoObject = decodeItem(branch[j]);
                    if (rhinoObject !== null) {
                        doc.objects().add(rhinoObject, null);
                    }
                }
            }
        }

        if (doc.objects().count < 1) {
            console.error('No rhino objects to load!');
            showSpinner(false);
            return;
        }

        // load rhino doc into three.js scene
        const buffer = new Uint8Array(doc.toByteArray()).buffer;

        // set up loader for converting the results to threejs
        const loader = new Rhino3dmLoader();
        loader.setLibraryPath('https://unpkg.com/rhino3dm@7.15.0/');

        loader.parse(buffer, function (object) {
            // change mesh material
            object.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshNormalMaterial({ wireframe: false });
                }
            }, false);

            // clear objects from scene. do this here to avoid blink
            scene.traverse(child => {
                if (!child.isLight) {
                    scene.remove(child);
                }
            });

            // add object graph from rhino model to three.js scene
            scene.add(object);

            // hide spinner and enable download button
            showSpinner(false);
            downloadButton.disabled = false;

            // zoom to extents
            zoomCameraToSelection(camera, controls, scene.children);
        });
    }

    /**
     * Attempt to decode data tree item to rhino geometry
     */
    function decodeItem(item) {
        const data = JSON.parse(item.data);
        if (item.type === 'System.String') {
            // hack for draco meshes
            try {
                return rhino.DracoCompression.decompressBase64String(data);
            } catch { } // ignore errors (maybe the string was just a string...)
        } else if (typeof data === 'object') {
            return rhino.CommonObject.decode(data);
        }
        return null;
    }

    function onSliderChange() {
        // show spinner
        document.getElementById('loader').style.display = 'block';
        compute();
    }

    // for when using production rhino.compute
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

    // download button handler
    function download() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const dateTimeStr = `${dateStr}_${timeStr}`;

        const filename = `rhinoFile_${dateTimeStr}.stl`;

        const exporter = new STLExporter();
        const stlString = exporter.parse(scene, { binary: false });
        saveString(stlString, filename);
    }

    function saveString(text, filename) {
        const blob = new Blob([text], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    // BOILERPLATE //

    function initThreeJS() {
        // Rhino models are z-up, so set this as the default
        THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

        // create a scene and a camera
        scene = new THREE.Scene();
        scene.background = new THREE.Color(1, 1, 1);
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
        // const camera = new THREE.OrthographicCamera( window.innerWidth / - 2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / - 2, 1, 1000 );
        camera.position.y = 200;
        camera.position.x = 200;
        camera.position.z = 200;

        // create renderer and add to HTML
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(document.getElementById('model').clientWidth, document.getElementById('model').clientHeight);
        document.getElementById('3d-model').appendChild(renderer.domElement);

        // add some controls to orbit the camera
        controls = new OrbitControls(camera, renderer.domElement);

        // add a directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff);
        directionalLight.intensity = 2;
        scene.add(directionalLight);

        const ambientLight = new THREE.AmbientLight();
        scene.add(ambientLight);

        // Handles changes in the window size
        window.addEventListener('resize', onWindowResize, false);

        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    function zoomCameraToSelection(camera, controls, selection, fitOffset = 1.1) {
        const box = new THREE.Box3();

        for (const object of selection) {
            if (object.isLight) continue;
            box.expandByObject(object);
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / camera.aspect;
        const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

        const direction = controls.target.clone()
            .sub(camera.position)
            .normalize()
            .multiplyScalar(distance);
        controls.maxDistance = distance * 10;
        controls.target.copy(center);

        camera.near = distance / 100;
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        camera.position.copy(controls.target).sub(direction);

        controls.update();
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
