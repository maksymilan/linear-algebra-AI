import React, { useState } from 'react';
import * as math from 'mathjs';
import { Calculator, X, Plus, Minus, X as MultiplyIcon } from 'lucide-react';

const MathCalculator = ({ isOpen, onClose }) => {
  const [matrixA, setMatrixA] = useState([[0, 0], [0, 0]]);
  const [matrixB, setMatrixB] = useState([[0, 0], [0, 0]]);
  const [size, setSize] = useState(2);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSizeChange = (newSize) => {
    setSize(newSize);
    setMatrixA(Array(newSize).fill(0).map(() => Array(newSize).fill(0)));
    setMatrixB(Array(newSize).fill(0).map(() => Array(newSize).fill(0)));
    setResult(null);
    setError(null);
  };

  const handleInputChange = (matrix, setMatrix, row, col, value) => {
    const newMatrix = [...matrix];
    newMatrix[row][col] = Number(value) || 0;
    setMatrix(newMatrix);
  };

  const calculate = (operation) => {
    try {
      setError(null);
      let res;
      switch (operation) {
        case 'det':
          res = math.det(matrixA);
          setResult(`det(A) = ${math.round(res, 4)}`);
          break;
        case 'inv':
          res = math.inv(matrixA);
          setResult(`A⁻¹ = \n${math.format(res, { precision: 4 }).replace(/\]/g, ']').replace(/\[/g, '[')}`);
          break;
        case 'add':
          res = math.add(matrixA, matrixB);
          setResult(`A + B = \n${math.format(res)}`);
          break;
        case 'multiply':
          res = math.multiply(matrixA, matrixB);
          setResult(`A × B = \n${math.format(res)}`);
          break;
        case 'transpose':
          res = math.transpose(matrixA);
          setResult(`Aᵀ = \n${math.format(res)}`);
          break;
        default:
          break;
      }
    } catch (err) {
      setError("计算错误，请检查矩阵是否可逆或格式正确");
      setResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-8 w-80 bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden z-50 flex flex-col font-sans">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-b border-gray-200">
        <div className="flex items-center gap-2 text-gray-800 font-medium">
          <Calculator size={18} />
          <span>矩阵计算器</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-black transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-[60vh]">
        {/* 控制面板 */}
        <div className="flex gap-2 mb-4 justify-center">
          <button 
            onClick={() => handleSizeChange(2)}
            className={`px-3 py-1 text-sm rounded ${size === 2 ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            2x2
          </button>
          <button 
            onClick={() => handleSizeChange(3)}
            className={`px-3 py-1 text-sm rounded ${size === 3 ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            3x3
          </button>
        </div>

        {/* 矩阵 A */}
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">矩阵 A</div>
          <div className="grid gap-1 w-fit mx-auto" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
            {matrixA.map((row, i) => 
              row.map((val, j) => (
                <input
                  key={`A-${i}-${j}`}
                  type="number"
                  value={val === 0 ? '' : val}
                  placeholder="0"
                  onChange={(e) => handleInputChange(matrixA, setMatrixA, i, j, e.target.value)}
                  className="w-12 h-10 text-center border border-gray-300 rounded focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-gray-800 bg-gray-50"
                />
              ))
            )}
          </div>
        </div>

        {/* 矩阵 B (对于双目运算) */}
        <div className="mb-4 pt-4 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-700 mb-2">矩阵 B (可选)</div>
          <div className="grid gap-1 w-fit mx-auto" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
            {matrixB.map((row, i) => 
              row.map((val, j) => (
                <input
                  key={`B-${i}-${j}`}
                  type="number"
                  value={val === 0 ? '' : val}
                  placeholder="0"
                  onChange={(e) => handleInputChange(matrixB, setMatrixB, i, j, e.target.value)}
                  className="w-12 h-10 text-center border border-gray-300 rounded focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-gray-800 bg-gray-50"
                />
              ))
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => calculate('det')} className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm rounded font-medium transition-colors">
            det(A)
          </button>
          <button onClick={() => calculate('inv')} className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm rounded font-medium transition-colors">
            A⁻¹
          </button>
          <button onClick={() => calculate('transpose')} className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm rounded font-medium transition-colors">
            Aᵀ
          </button>
          <button onClick={() => calculate('add')} className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm rounded font-medium transition-colors flex items-center justify-center gap-1">
            A <Plus size={14}/> B
          </button>
          <button onClick={() => calculate('multiply')} className="col-span-2 py-2 bg-black hover:bg-gray-800 text-white text-sm rounded font-medium transition-colors flex items-center justify-center gap-1">
            A <MultiplyIcon size={14}/> B
          </button>
        </div>

        {/* 结果显示 */}
        {(result || error) && (
          <div className={`p-3 rounded text-sm whitespace-pre-wrap font-mono ${error ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-black border border-gray-200'}`}>
            {error || result}
          </div>
        )}
      </div>
    </div>
  );
};

export default MathCalculator;
