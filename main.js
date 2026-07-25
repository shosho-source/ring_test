import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Ensure website starts at the top on reload
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.addEventListener('beforeunload', () => {
    window.scrollTo(0, 0);
});
window.addEventListener('load', () => {
    window.scrollTo(0, 0);
});

const canvas = document.querySelector('#webgl-canvas');
const scene = new THREE.Scene();
    // Dark earthy environment
    scene.background = new THREE.Color('#231C14'); 
    scene.fog = new THREE.FogExp2('#231C14', 0.04);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const loadingManager = new THREE.LoadingManager();

let assetsLoaded = false;
let ringsBuilt = false;

function checkReady() {
    if (assetsLoaded && ringsBuilt) {
        const bands = document.querySelectorAll('.ring-band');
        const gems = document.querySelectorAll('.ring-gem');
        
        bands.forEach(band => {
            band.style.animation = 'drawBand 5s ease-in-out forwards';
        });
        
        gems.forEach(gem => {
            gem.style.animation = 'pulseGem 5s ease-in-out forwards';
        });
        
        const loader = document.getElementById('loader');
        if (loader) {
            gsap.to(loader, { 
                opacity: 0, 
                delay: 4.5, // Wait until animation is almost finished
                duration: 2.5, // Much smoother, slower fade transition
                onComplete: () => loader.style.display = 'none' 
            });
        }
    }
}

loadingManager.onLoad = () => {
    assetsLoaded = true;
    checkReady();
};

const gltfLoader = new GLTFLoader(loadingManager);
const rgbeLoader = new HDRLoader(loadingManager);
const textureLoader = new THREE.TextureLoader(loadingManager);

// Load wood textures
const woodDiffuse = textureLoader.load('/wood_diffuse.jpg');
woodDiffuse.colorSpace = THREE.SRGBColorSpace;
woodDiffuse.wrapS = THREE.RepeatWrapping;
woodDiffuse.wrapT = THREE.RepeatWrapping;
woodDiffuse.repeat.set(4, 4);

const woodBump = textureLoader.load('/wood_bump.jpg');
woodBump.wrapS = THREE.RepeatWrapping;
woodBump.wrapT = THREE.RepeatWrapping;
woodBump.repeat.set(4, 4);

const woodRoughness = textureLoader.load('/wood_roughness.jpg');
woodRoughness.wrapS = THREE.RepeatWrapping;
woodRoughness.wrapT = THREE.RepeatWrapping;
woodRoughness.repeat.set(4, 4);

let ring;
const ringGroup = new THREE.Group();
scene.add(ringGroup);

let riverRings = [];
const riverGroup = new THREE.Group();
scene.add(riverGroup);
riverGroup.position.y = -10; // Hidden initially
riverGroup.rotation.z = 0; // Flat horizontal flow

// Physics Setup
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0.5, 0, -4) // Pull right (X) and back (Z)
});
world.broadphase = new CANNON.SAPBroadphase(world);

const ringPhysMaterial = new CANNON.Material();
const wallPhysMaterial = new CANNON.Material();
const contactMaterial = new CANNON.ContactMaterial(wallPhysMaterial, ringPhysMaterial, {
    friction: 0.0,
    restitution: 0.2
});
const ringContactMaterial = new CANNON.ContactMaterial(ringPhysMaterial, ringPhysMaterial, {
    friction: 0.0,
    restitution: 0.6
});
world.addContactMaterial(contactMaterial);
world.addContactMaterial(ringContactMaterial);

// Boundaries for flat river (facing camera)
const backWall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: wallPhysMaterial });
backWall.position.set(0, 0, -2); // The new "floor" they slide on, facing +Z
world.addBody(backWall);

const topWall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: wallPhysMaterial });
topWall.quaternion.setFromEuler(Math.PI / 2, 0, 0); // Facing -Y
topWall.position.set(0, 8, 0); 
world.addBody(topWall);

const bottomWall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: wallPhysMaterial });
bottomWall.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Facing +Y
bottomWall.position.set(0, -4, 0);
world.addBody(bottomWall);

const mouseBody = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(0.35), // Smaller repeller so rings can flow around it easily
    material: wallPhysMaterial
});
mouseBody.position.set(0, -100, 0);
world.addBody(mouseBody);

const ambientLight = new THREE.AmbientLight(0xffe6cc, 0.8); // Softer, warmer overall
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff5e6, 0.7); // Less harsh direct lighting
dirLight.position.set(5, 5, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.radius = 8; // Softer shadows
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 25;
scene.add(dirLight);

// Shadow receiver plane
const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.ShadowMaterial({ opacity: 0.15 }) // Subtler shadow
);
shadowPlane.position.z = -3;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const woodMaterial = new THREE.MeshStandardMaterial({
    map: woodDiffuse,
    bumpMap: woodBump,
    bumpScale: 0.015,
    roughnessMap: woodRoughness,
    roughness: 1.0,
    metalness: 0.0,
    color: 0x9c6b45, // warm brown tint
    envMapIntensity: 0.1 // minimal reflection for matte wood
});

const diamondMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0,
    transmission: 1,
    ior: 2.4,
    thickness: 1.0,
    envMapIntensity: 3,
    clearcoat: 1,
    clearcoatRoughness: 0
});

rgbeLoader.load('/studio_small_09_1k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
});

gltfLoader.load('/ring.gltf', (gltf) => {
    ring = gltf.scene;
    
    ring.traverse((child) => {
        if (child.isMesh) {
            // Force wood material on everything
            child.material = woodMaterial;
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const box = new THREE.Box3().setFromObject(ring);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const scale = 2 / maxDim;
    ring.scale.set(scale, scale, scale);
    ring.position.sub(center.multiplyScalar(scale));
    
    ringGroup.add(ring);
    
    ringGroup.rotation.x = Math.PI * 0.1;
    ringGroup.rotation.y = -Math.PI * 0.2;
    
    setupAnimations();

    // Build river of rings asynchronously to prevent blocking the loading animation
    let ringsCreated = 0;
    const totalRings = 350;
    const chunkSize = 2; // Extremely small chunks to guarantee zero loading lag
    
    function createRingChunk() {
        const limit = Math.min(ringsCreated + chunkSize, totalRings);
        for(let i=ringsCreated; i<limit; i++) {
            const clonedRing = ring.clone();
            
            const s = 0.03 + Math.random() * 0.05; // much smaller rings
            clonedRing.scale.set(s, s, s);
            clonedRing.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            riverGroup.add(clonedRing);
            
            // Physics Body
            const radius = s * 1.2; 
            const body = new CANNON.Body({
                mass: 1,
                shape: new CANNON.Sphere(radius),
                material: ringPhysMaterial,
                angularDamping: 0.95, // Heavy damping for slow-mo spin
                linearDamping: 0.1,
                position: new CANNON.Vec3(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 12,
                    -1.5 + Math.random()
                )
            });
            
            body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            world.addBody(body);
            
            riverRings.push({ mesh: clonedRing, body: body });
        }
        ringsCreated += chunkSize;
        if (ringsCreated < totalRings) {
            requestAnimationFrame(createRingChunk);
        } else {
            ringsBuilt = true;
            checkReady();
        }
    }
    
    createRingChunk();
});

const mouse = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

function setupAnimations() {
    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: ".content-wrapper",
            start: "top top",
            end: "bottom bottom",
            scrub: 2.5,
        }
    });

    tl.to(ringGroup.position, { x: -1.5, y: 0.5, z: 1.5, ease: "power1.inOut" })
      .to(ringGroup.rotation, { x: Math.PI * 1.5, y: -Math.PI * 0.5, ease: "power1.inOut" }, "<")
    
    // Heritage
      .to(ringGroup.position, { x: 1.2, y: -0.2, z: 0, ease: "power1.inOut" })
      .to(ringGroup.rotation, { x: -Math.PI * 0.2, y: Math.PI * 1.2, ease: "power1.inOut" }, "<")
    
    // Sustainability
      .to(ringGroup.position, { x: -1.2, y: 0.2, z: -1, ease: "power1.inOut" })
      .to(ringGroup.rotation, { x: Math.PI * 0.8, y: -Math.PI * 1.8, ease: "power1.inOut" }, "<")
      
    // Details
      .to(ringGroup.position, { x: 0.8, y: 0.8, z: 1, ease: "power1.inOut" })
      .to(ringGroup.rotation, { x: Math.PI * 2.1, y: Math.PI * 0.5, ease: "power1.inOut" }, "<")

    // River View
      .to(ringGroup.position, { x: 0, y: 1.5, z: -1, ease: "power1.inOut" })
      .to(ringGroup.rotation, { x: Math.PI * 3, y: Math.PI * 2, ease: "power1.inOut" }, "<")
      .to(ringGroup.scale, { x: 0.6, y: 0.6, z: 0.6, ease: "power1.inOut" }, "<")
      .to(riverGroup.position, { y: -1.5, ease: "power1.inOut" }, "<")
      
    // Contact
      .to(ringGroup.position, { x: 0, y: 0.5, z: 1.5, ease: "power1.inOut" })
      .to(ringGroup.rotation, { x: Math.PI * 4, y: Math.PI * 2.5, ease: "power1.inOut" }, "<")
      .to(riverGroup.position, { y: -0.5, ease: "power1.inOut" }, "<"); // Let it flow gracefully in the background
}

const startTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    const time = (performance.now() - startTime) / 1000;

    if (ringGroup.children.length > 0) {
        
        // Enhanced camera parallax physics
        camera.position.x += (mouse.x * 1.0 - camera.position.x) * 0.04;
        camera.position.y += (mouse.y * 1.0 - camera.position.y) * 0.04;
        camera.lookAt(scene.position);
        
        ringGroup.children.forEach(child => {
            // Dynamic hover effect
            child.position.y = Math.sin(time * 2.0) * 0.02;
            
            // Continuous rotation
            child.rotation.y += 0.008;
            
            // Additional ring tilt physics based on mouse
            const targetRotX = mouse.y * 0.4;
            const targetRotZ = -mouse.x * 0.4;
            
            child.rotation.x += (targetRotX - child.rotation.x) * 0.05;
            child.rotation.z += (targetRotZ - child.rotation.z) * 0.05;
        });
    }
    
    // Physics step
    world.step(1/60);
    
    // Mouse repeller logic
    raycaster.setFromCamera(mouse, camera);
    const target = new THREE.Vector3();
    const intersect = raycaster.ray.intersectPlane(mousePlane, target);
    if (intersect) {
        // Convert global mouse position to riverGroup local space
        const localTarget = riverGroup.worldToLocal(target.clone());
        // Ease the mouse repeller position so it softly pushes the rings
        mouseBody.position.x += (localTarget.x - mouseBody.position.x) * 0.05;
        mouseBody.position.y += (localTarget.y - mouseBody.position.y) * 0.05;
        mouseBody.position.z += (localTarget.z - mouseBody.position.z) * 0.05;
    } else {
        mouseBody.position.set(0, -100, 0); // Hide if mouse leaves plane
    }

    // Sync bodies
    riverRings.forEach(r => {
        // Infinite flow wrap-around
        if (r.body.position.x > 15) {
            r.body.position.x = -15 - Math.random() * 5;
            r.body.position.y = (Math.random() - 0.5) * 12;
            r.body.position.z = -1.5 + Math.random();
            r.body.velocity.set(1.5 + Math.random(), 0, 0);
            r.body.angularVelocity.set(0, 0, 0);
        }
        
        r.mesh.position.copy(r.body.position);
        r.mesh.quaternion.copy(r.body.quaternion);
    });

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
