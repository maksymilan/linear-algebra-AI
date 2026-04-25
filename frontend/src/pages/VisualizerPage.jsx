import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import VisualizationCanvas from '../components/VisualizationCanvas';
import { ArrowLeft } from 'lucide-react';

const VisualizerPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    
    // 解析 URL 参数中的矩阵，例如 ?matrix=2,0,0,1&dim=2
    const initialDim = parseInt(searchParams.get('dim')) || 2;
    const initialMatrixStr = searchParams.get('matrix');
    
    let defaultMatrix2d = [[1, 0], [0, 1]];
    let defaultMatrix3d = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    if (initialMatrixStr) {
        const nums = initialMatrixStr.split(',').map(Number);
        if (initialDim === 2 && nums.length === 4) {
            defaultMatrix2d = [[nums[0], nums[1]], [nums[2], nums[3]]];
        } else if (initialDim === 3 && nums.length === 9) {
            defaultMatrix3d = [
                [nums[0], nums[1], nums[2]],
                [nums[3], nums[4], nums[5]],
                [nums[6], nums[7], nums[8]]
            ];
        }
    }

    const [dimension, setDimension] = useState(initialDim);
    const [matrix2d, setMatrix2d] = useState(defaultMatrix2d);
    const [matrix3d, setMatrix3d] = useState(defaultMatrix3d);

    const currentMatrix = dimension === 2 ? matrix2d : matrix3d;
    const setCurrentMatrix = dimension === 2 ? setMatrix2d : setMatrix3d;

    return (
        <div className="flex flex-col h-screen w-screen bg-[#F1F3F5] overflow-hidden font-sans">
            {/* 顶部导航栏 */}
            <header className="flex items-center px-6 py-4 bg-white border-b border-[#DEE2E6] shrink-0 shadow-sm z-10">
                <button 
                    onClick={() => navigate(-1)} 
                    className="flex items-center gap-2 text-[#868E96] hover:text-black transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span className="font-medium">返回</span>
                </button>
                <div className="mx-auto text-lg font-bold text-[#212529] tracking-wide">
                    几何变换可视化引擎
                </div>
                <div className="w-[60px]"></div> {/* 占位以居中标题 */}
            </header>

            {/* 可视化画布区域 */}
            <main className="flex-1 relative w-full h-full">
                <VisualizationCanvas 
                    key={dimension}
                    dimension={dimension}
                    matrix={currentMatrix}
                    onDimensionChange={setDimension}
                    onMatrixChange={setCurrentMatrix}
                />
            </main>
        </div>
    );
};

export default VisualizerPage;
