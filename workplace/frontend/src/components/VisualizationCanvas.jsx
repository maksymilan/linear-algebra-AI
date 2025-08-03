import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import './VisualizationCanvas.css';

// --- 1. 整个文件现在是纯展示组件，接收props ---

// ... (CustomArrow, ZUpGrid, ZUpMultiPlaneGrid, Custom2DAxes, Legend components remain exactly the same)
const CustomArrow = ({ direction, length, color }) => {
  const groupRef = useRef();
  useLayoutEffect(() => {
    if (groupRef.current) {
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      groupRef.current.quaternion.copy(quaternion);
    }
  }, [direction]);
  
  const headLengthRatio = 0.2;
  const headWidthRatio = headLengthRatio * 0.8;
  const shaftLength = length * (1 - headLengthRatio);
  const headLength = length * headLengthRatio;
  const headWidth = length * headWidthRatio;

  return (
    <group ref={groupRef}>
      <mesh position={[0, shaftLength / 2, 0]} scale={[0.125 * headWidth, shaftLength, 0.125 * headWidth]}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, shaftLength, 0]} scale={[headWidth, headLength, headWidth]}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
};

const ZUpGrid = ({ ...props }) => (
  <>
    <Grid rotation={[Math.PI / 2, 0, 0]} {...props} />
  </>
);

const ZUpMultiPlaneGrid = ({ ...props }) => (
  <>
    <Grid rotation={[Math.PI / 2, 0, 0]} {...props} /> 
    <Grid rotation={[0, 0, 0]} {...props} />
    <Grid rotation={[0, Math.PI / 2, 0]} {...props} />
  </>
);

const Custom2DAxes = ({ size = 5 }) => {
    const vertices = useMemo(() => new Float32Array([0, 0, 0,  size, 0, 0, 0, 0, 0,  0, size, 0]), [size]);
    const colors = useMemo(() => new Float32Array([1, 0, 0,   1, 0, 0, 0, 1, 0,   0, 1, 0]), []);
  
    return (
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={vertices.length / 3} array={vertices} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors={true} toneMapped={false} />
      </lineSegments>
    );
};

const Legend = ({ dimension }) => (
    <div className="vis-overlay vis-legend">
        <div className="vis-legend-title">基向量</div>
        <div className="vis-legend-item">
            <span className="vis-legend-color-box" style={{ backgroundColor: '#ff6347' }}></span>
            <span>î (X-axis)</span>
        </div>
        <div className="vis-legend-item">
            <span className="vis-legend-color-box" style={{ backgroundColor: '#90ee90' }}></span>
            <span>ĵ (Y-axis)</span>
        </div>
        {dimension === 3 && (
            <div className="vis-legend-item">
                <span className="vis-legend-color-box" style={{ backgroundColor: '#f0e68c' }}></span>
                <span>k̂ (Z-axis)</span>
            </div>
        )}
    </div>
);


const Scene3B1B = ({ matrix, dimension }) => {
  const { mat } = useSpring({ mat: matrix.flat(), config: { mass: 1, tension: 120, friction: 26 } });
  const i_hat_vec = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const j_hat_vec = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const k_hat_vec = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const gridProps = { args: [10, 10], cellSize: 1, infiniteGrid: true, fadeDistance: 25 };
  
  return (
    <>
      <animated.group
        matrix={mat.to((...m) => {
          const mat4 = new THREE.Matrix4();
          if (dimension === 2) { 
              mat4.set(m[0], m[1], 0, 0, m[2], m[3], 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
          } else { 
              mat4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
          }
          return mat4;
        })}
        matrixAutoUpdate={false}
      >
        {dimension === 3 
            ? <ZUpMultiPlaneGrid {...gridProps} cellColor="#add8e6" sectionColor="#87ceeb" cellThickness={1.5} sectionThickness={2} /> 
            : <ZUpGrid {...gridProps} cellColor="#add8e6" sectionColor="#87ceeb" cellThickness={1.5} sectionThickness={2} />
        }
        <CustomArrow direction={i_hat_vec} length={1} color="#ff6347" />
        <CustomArrow direction={j_hat_vec} length={1} color="#90ee90" />
        {dimension === 3 && <CustomArrow direction={k_hat_vec} length={1} color="#f0e68c" />}
      </animated.group>

      <animated.mesh position={mat.to((...m) => new THREE.Vector3(m[0], m[3], dimension === 3 ? m[6] : 0).multiplyScalar(1.2))}>
          <Text fontSize={0.5} color="#d1422a" characters="î" />
      </animated.mesh>
      <animated.mesh position={mat.to((...m) => new THREE.Vector3(m[1], m[4], dimension === 3 ? m[7] : 0).multiplyScalar(1.2))}>
          <Text fontSize={0.5} color="#59a959" characters="ĵ" />
      </animated.mesh>
      {dimension === 3 &&
          <animated.mesh position={mat.to((...m) => new THREE.Vector3(m[2], m[5], m[8]).multiplyScalar(1.2))}>
              <Text fontSize={0.5} color="#b4a956" characters="k̂" />
          </animated.mesh>
      }
      {dimension === 3 ? <axesHelper args={[5]} /> : <Custom2DAxes size={5} />}
    </>
  );
};

const MatrixInput = ({ matrix, onMatrixChange, dimension }) => {
    const colLabels = dimension === 3 ? ['î', 'ĵ', 'k̂'] : ['î', 'ĵ'];
    const rowLabels = dimension === 3 ? ['x', 'y', 'z'] : ['x', 'y'];

    const handleInputChange = (e, r, c) => {
        const value = e.target.value;
        const newMatrix = matrix.map(row => [...row]);
        if (value === '' || value === '-' || value.endsWith('.')) {
            newMatrix[r][c] = value;
        } else {
            const numValue = parseFloat(value);
            newMatrix[r][c] = isNaN(numValue) ? value : numValue;
        }
        onMatrixChange(newMatrix);
    };

    return (
        <div className="matrix-input-grid" style={{ gridTemplateColumns: `20px repeat(${dimension}, 1fr)`}}>
            <div></div>
            {colLabels.map(label => <div key={label} className="label">{label}</div>)}
            {rowLabels.map((rowLabel, r) => (
                <React.Fragment key={rowLabel}>
                    <div className="label">{rowLabel}</div>
                    {colLabels.map((_, c) => (
                        <input
                            key={`${r}-${c}`}
                            type="text"
                            value={matrix[r][c]}
                            onChange={(e) => handleInputChange(e, r, c)}
                        />
                    ))}
                </React.Fragment>
            ))}
        </div>
    );
}

// --- 2. 顶层组件现在只接收props，不再管理自己的状态 ---
const VisualizationCanvas = ({ dimension, matrix, onDimensionChange, onMatrixChange, ...props }) => {
    
    // 验证矩阵是否所有值都是有效数字
    const isMatrixValid = useMemo(() => matrix.flat().every(cell => typeof cell === 'number' && !isNaN(cell)), [matrix]);
    
    // 创建一个仅在矩阵有效时传递给场景的 memoized 版本
    const validMatrixForScene = useMemo(() => {
        if (isMatrixValid) return matrix;
        return dimension === 2 ? [[1, 0], [0, 1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    }, [isMatrixValid, matrix, dimension]);

    return (
      <div className="vis-container" {...props}>
          <div className="vis-controls-panel">
              <div className="vis-dimension-buttons">
                  <button onClick={() => onDimensionChange(2)} disabled={dimension === 2}>2D</button>
                  <button onClick={() => onDimensionChange(3)} disabled={dimension === 3}>3D</button>
              </div>
              <MatrixInput matrix={matrix} onMatrixChange={onMatrixChange} dimension={dimension} />
          </div>
          <div className="vis-canvas-wrapper">
              <Canvas camera={{ position: [4, 4, 4], up: [0, 0, 1] }}>
                  <color attach="background" args={['#ffffff']} />
                  <Scene3B1B matrix={validMatrixForScene} dimension={dimension} />
                  <OrbitControls />
              </Canvas>
              <Legend dimension={dimension} />
              <div className="vis-overlay vis-view-label">
                  {dimension}D 视图
              </div>
          </div>
      </div>
    );
};

export default VisualizationCanvas;