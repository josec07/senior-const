import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // Import GLTFLoader
// import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'; // <-- NO LONGER NEEDED
// Optional: Add OrbitControls for easy navigation during setup
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; // <-- REMOVED
// import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'; // <-- REMOVED
import './App.css' // Keep basic styling

// Constants for path and interaction
const PATH_LENGTH = 90; // How far the initial path segment goes (related to tree spacing)
const MAX_CAMERA_Z = 5; // Farthest back the camera can go (start position)
const MIN_CAMERA_Z = -(PATH_LENGTH - 15); // How far user can travel into the scene
const SCROLL_SENSITIVITY = 0.005;
const DRAG_SENSITIVITY = 0.02;

function App() {
  const mountRef = useRef(null); // Ref to the div where the canvas will be mounted
  const [showInstructions, setShowInstructions] = useState(true);

  // State to hold tree data for UI popups
  const [trees, setTrees] = useState([]);
  // Ref to store the actual THREE.Object3D clones
  const treeClonesRef = useRef([]);

  // Path progress state ref
  const cameraZ = useRef(MAX_CAMERA_Z); // Start at the back
  const isDragging = useRef(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  let animationFrameId = null; // Declare outside animate scope

  useEffect(() => {
    const currentMount = mountRef.current; // Capture mountRef.current
    if (!currentMount) return; // Exit if mount point is not available yet

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Even darker background
    // Add exponential fog for denser effect
    scene.fog = new THREE.FogExp2(0x050505, 0.06); // color, density

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight, // Use mount size
      0.1,
      1000
    );
    camera.position.set(0, 1.6, cameraZ.current); // Use state ref for Z
    camera.lookAt(0, 1.5, cameraZ.current - 10); // Look slightly ahead down the path

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    // Controls (Optional but helpful for setup)
    // const controls = new OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true; // Smooths camera movement

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Slightly brighter ambient
    scene.add(ambientLight);
    // Optional point light for subtle variations
    // const pointLight = new THREE.PointLight(0x88aaff, 0.5, 100);
    // pointLight.position.set(10, 20, 10);
    // scene.add(pointLight);

    // Ground Plane
    const groundGeometry = new THREE.PlaneGeometry(30, 100); // Narrower, longer ground
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x111111, // Very dark ground
        side: THREE.DoubleSide, 
        roughness: 1.0, // More rough
        metalness: 0.0  // Less metallic
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be flat
    ground.position.y = -0.5; // Position slightly below origin
    scene.add(ground);

    // --- Test Cube --- 
    // const testGeometry = new THREE.BoxGeometry(1, 1, 1);
    // const testMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red
    // const testCube = new THREE.Mesh(testGeometry, testMaterial);
    // testCube.position.set(0, 1, 0); // Position slightly above ground at origin
    // scene.add(testCube);
    // console.log("Test cube added to scene");
    // --- End Test Cube ---

    // --- Loader Setup with DRACO ---
    // const dracoLoader = new DRACOLoader();
    // // **Important:** Point to the folder containing the decoder files inside 'public'
    // dracoLoader.setDecoderPath('/draco/');
    // dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder, WASM is often default/auto

    const loader = new GLTFLoader();
    // loader.setDRACOLoader(dracoLoader); // <-- NO LONGER NEEDED
    // --- End Loader Setup ---

    // --- Helper: Project 3D to 2D --- 
    const projectToScreen = (vector, cameraInstance) => {
        const projected = vector.clone().project(cameraInstance);
        // Check if behind camera
        if (projected.z > 1) return null; 

        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;
        const widthHalf = width / 2;
        const heightHalf = height / 2;

        return {
            x: (projected.x * widthHalf) + widthHalf,
            y: -(projected.y * heightHalf) + heightHalf,
        };
    };
    // --- End Helper ---

    loader.load(
      '/glowing_trees.glb',
      (gltf) => {
        console.log('GLTF loaded successfully');
        console.log('Camera position:', camera.position);

        // Get references to the specific objects within the loaded scene
        const treeA = gltf.scene.getObjectByName('fir_tree_01_a');
        const treeB = gltf.scene.getObjectByName('fir_tree_01_b');
        const particleShape = gltf.scene.getObjectByName('Particle_Shape');

        // **Rename check** - Use the actual names from your final export
        // Example assumes the final names were Tree_A_JoinedMesh etc.
        console.log("Looking for names: fir_tree_01_a, fir_tree_01_b"); // Log expected names
        console.log("Found treeA:", treeA);
        console.log("Found treeB:", treeB);
        // console.log("Found particleShape:", particleShape); // Particle shape not strictly needed now

        if (treeA) {
            console.log("treeA.visible:", treeA.visible);
            // console.log("treeA children:", treeA.children); // Less relevant now
            // if (treeA.children.length > 0) { ... } // Less relevant now
        }
        // --- DEBUGGING END ---

        if (!treeA || !treeB) {
          console.error("Could not find tree objects ('fir_tree_01_a' or 'fir_tree_01_b') in the loaded GLTF! Check names.");
          return; // Stop if trees aren't found
        }

        // We probably don't need to hide the particle shape if it wasn't exported or is irrelevant
        // if (particleShape) {
        //    particleShape.visible = false; 
        // }

        const numberOfTrees = 12; // Fewer trees
        const corridorWidth = 8; // How far trees are placed side-to-side
        const treeSpacing = 15; // How far apart trees are along the path

        // Need to access trees state setter
        const tempTrees = [];
        treeClonesRef.current = []; // Clear previous clones

        for (let i = 0; i < numberOfTrees; i++) {
          // Alternate between cloning treeA and treeB
          const sourceTree = (i % 2 === 0) ? treeA : treeB;
          // **Important:** Clone might fail if sourceTree is null, but we checked above
          const treeClone = sourceTree.clone();

          // Place trees along sides of a corridor
          const side = (i % 2 === 0) ? 1 : -1; // Alternate left (-1) and right (1)
          const x = side * (corridorWidth / 2 + (Math.random() - 0.5) * 2); // Place near edge +/- random offset
          const z = -(i * treeSpacing / 2); // Place along Z axis, spacing them out
          treeClone.position.set(x, -0.5, z);
          treeClone.rotation.y = Math.random() * Math.PI * 2;
          const scaleVar = 1.0 + (Math.random() - 0.5) * 0.3; // Scale 0.85 to 1.15
          treeClone.scale.set(scaleVar, scaleVar, scaleVar);

          scene.add(treeClone);
          treeClonesRef.current.push(treeClone); // Store the Object3D

          // Store data needed for UI
          tempTrees.push({ 
              id: `tree-${i}`,
              worldPosition: treeClone.position.clone(), // Store initial world pos
              screenPosition: { x: -100, y: -100 }, // Initial off-screen pos
              isVisible: false, // Initially not visible
              opacity: 1.0 // Default opacity
          });

          // Removed logging for first clone position/scale
        }
        setTrees(tempTrees); // Set initial tree data state
        // Ensure the original gltf.scene itself is not added
      },
      undefined, // Progress callback (optional)
      (error) => {
        console.error('An error happened loading the GLTF:', error);
      }
    );

    // --- Atmospheric Fog Particles ---
    const particleCount = 5000; // Adjust for density/performance
    const particleVolumeWidth = 40;
    const particleVolumeHeight = 20;
    const particleVolumeDepth = 150; // Spread along the path
    const fogParticlesGeometry = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < particleCount; i++) {
        const x = (Math.random() - 0.5) * particleVolumeWidth;
        const y = Math.random() * particleVolumeHeight;
        const z = (Math.random() - 1.0) * particleVolumeDepth; // Place mostly in front
        positions.push(x, y, z);
    }
    fogParticlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const fogParticlesMaterial = new THREE.PointsMaterial({
        color: 0xadd8e6, // Light blue
        size: 0.08,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending, // Makes particles glow when overlapping
        depthWrite: false // Prevents rendering issues with transparency
    });

    const fogParticles = new THREE.Points(fogParticlesGeometry, fogParticlesMaterial);
    scene.add(fogParticles);
    // --- End Fog Particles ---

    // --- Scroll / Drag Input Logic ---
    const handleScroll = (event) => {
        const delta = event.deltaY * SCROLL_SENSITIVITY;
        cameraZ.current -= delta;
        // Clamp position
        cameraZ.current = Math.max(MIN_CAMERA_Z, Math.min(MAX_CAMERA_Z, cameraZ.current));
        setShowInstructions(false); // Hide instructions on first interaction
    };

    const handlePointerDown = (event) => {
        isDragging.current = true;
        startY.current = event.clientY || event.touches[0].clientY;
        currentMount.style.cursor = 'grabbing';
        setShowInstructions(false);
    };

    const handlePointerMove = (event) => {
        if (!isDragging.current) return;
        currentY.current = event.clientY || event.touches[0].clientY;
        const deltaY = (currentY.current - startY.current) * DRAG_SENSITIVITY;
        cameraZ.current += deltaY; // Dragging down moves camera forward (decreases Z)
        // Clamp position
        cameraZ.current = Math.max(MIN_CAMERA_Z, Math.min(MAX_CAMERA_Z, cameraZ.current));
        startY.current = currentY.current; // Update startY for continuous drag
    };

    const handlePointerUp = () => {
        isDragging.current = false;
        currentMount.style.cursor = 'grab';
    };

    currentMount.addEventListener('wheel', handleScroll, { passive: true });
    currentMount.addEventListener('pointerdown', handlePointerDown);
    currentMount.addEventListener('pointermove', handlePointerMove);
    currentMount.addEventListener('pointerup', handlePointerUp);
    currentMount.addEventListener('pointerleave', handlePointerUp); // Also stop dragging if pointer leaves
    // --- End Scroll / Drag Input Logic ---

    let prevTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate); // Assign to outer scope variable

      const time = performance.now();
      const delta = (time - prevTime) / 1000;

      // Simple function to map distance to opacity (tweak ranges as needed)
      const calculateOpacity = (distance) => {
          const fadeStartDistance = 25; // Start fading
          const fadeEndDistance = 55;   // Fully faded (should be near fog far distance)
          if (distance < fadeStartDistance) return 1.0;
          if (distance > fadeEndDistance) return 0.0;
          return 1.0 - (distance - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
      };

      // Update camera position based on scroll/drag state
      camera.position.z = cameraZ.current;
      camera.lookAt(0, 1.5, cameraZ.current - 10);

      // Update UI Tree Positions
      setTrees(prevTrees => 
          prevTrees.map((tree, index) => {
              const treeObject = treeClonesRef.current[index];
              if (!treeObject) return tree; // Should not happen if lengths match

              // Get current world position 
              const treeBasePos = treeObject.position;
              const targetPoint = treeBasePos.clone().add(new THREE.Vector3(0, 5, 0)); // Offset Y by 5 units

              // Calculate screen position for the target point
              const screenPos = projectToScreen(targetPoint, camera);

              // --- Calculate distance and opacity --- 
              const distance = camera.position.distanceTo(treeBasePos); // Use base position for distance
              const opacity = calculateOpacity(distance);

              // --- Calculate Horizontal Offset --- 
              const screenOffsetX = 30; // How many pixels to offset horizontally
              let adjustedScreenX = screenPos ? screenPos.x : -100;
              if (screenPos) { // Only apply offset if the point is visible
                  if (treeBasePos.x < 0) { // Tree is on the left side
                      adjustedScreenX += screenOffsetX;
                  } else { // Tree is on the right side
                      adjustedScreenX -= screenOffsetX;
                  }
              }
              // --- End Horizontal Offset ---

              // Only create new object if something actually changed
              const newScreenPos = screenPos ? { x: adjustedScreenX, y: screenPos.y } : { x: -100, y: -100 };
              const newIsVisible = screenPos !== null && opacity > 0.01; // Consider invisible if fully faded

              if (tree.isVisible !== newIsVisible ||
                  Math.abs(tree.opacity - opacity) > 0.01 || // Check opacity change
                  tree.screenPosition.x !== newScreenPos.x || 
                  tree.screenPosition.y !== newScreenPos.y) {
                  return {
                      ...tree,
                      screenPosition: newScreenPos,
                      isVisible: newIsVisible,
                      opacity: opacity // Store opacity
                  };
              }
              return tree; // Return original object if no change
          })
      );

      renderer.render(scene, camera);
      prevTime = time;
    };
    animate();

    // Handle window resize
    const handleResize = () => {
        if (currentMount) { // Check if mount point exists
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        }
    };
    // Initial resize call
    handleResize();
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId); // Stop animation loop if ID exists
      }
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('wheel', handleScroll);
      currentMount.removeEventListener('pointerdown', handlePointerDown);
      currentMount.removeEventListener('pointermove', handlePointerMove);
      currentMount.removeEventListener('pointerup', handlePointerUp);
      currentMount.removeEventListener('pointerleave', handlePointerUp);
      // Ensure currentMount and renderer.domElement exist before removal
       if (currentMount && renderer.domElement) {
         try {
            currentMount.removeChild(renderer.domElement);
         } catch (e) {
            console.warn("Could not remove renderer DOM element:", e);
         }
       }
      // Dispose Three.js resources properly
      scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
          } else {
              object.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div 
      ref={mountRef} 
      style={{ width: '100vw', height: '100vh', display: 'block', cursor: 'grab', position: 'relative' }} // Added position:relative
     > 
      {showInstructions && (
        <div style={overlayStyle}>
            Scroll or Drag Down to Move Forward
        </div>
      )}

      {/* Render Tree UI Popups */} 
      {trees.map(tree => (
         tree.isVisible && (
             <div 
                 key={tree.id} 
                 style={{
                     position: 'absolute',
                     left: `${tree.screenPosition.x}px`,
                     top: `${tree.screenPosition.y}px`,
                     transform: 'translate(-50%, -50%)', // Center the div on the point
                     width: '20px',
                     height: '20px',
                     backgroundColor: `rgba(200, 200, 255, ${tree.opacity * 0.6})`, // Use state opacity
                     borderRadius: '50%',
                     border: `1px solid rgba(255, 255, 255, ${tree.opacity * 0.8})`,
                     cursor: 'pointer',
                     pointerEvents: 'auto', // Make sure it's clickable
                     zIndex: 5 // Below instructions overlay
                 }}
                 onClick={() => console.log(`Clicked tree ${tree.id}`)} // Placeholder action
             />
         )
      ))}
    </div>
  );
}

const overlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: 'white',
  fontSize: '24px',
  fontFamily: 'sans-serif',
  zIndex: 10, // Ensure it's on top
  cursor: 'default', // Ensure text overlay doesn't interfere with grabbing
};

export default App;
