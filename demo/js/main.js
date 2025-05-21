// Enable tooltips
document.addEventListener('DOMContentLoaded', function() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

// QA Page functionalities
if (document.getElementById('qa-form')) {
    const qaForm = document.getElementById('qa-form');
    const questionInput = document.getElementById('question-input');
    const messageList = document.getElementById('message-list');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('preview-container');
    const removePreviewBtn = document.getElementById('remove-preview');

    // Handle image upload preview
    imageUpload.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                previewContainer.classList.remove('d-none');
            };
            
            reader.readAsDataURL(this.files[0]);
        }
    });

    // Remove image preview
    if (removePreviewBtn) {
        removePreviewBtn.addEventListener('click', function() {
            imageUpload.value = '';
            previewContainer.classList.add('d-none');
        });
    }

    // Handle question submission
    qaForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (questionInput.value.trim() === '' && !imageUpload.files[0]) {
            return; // Don't submit if no question or image
        }
        
        // Add student message to chat
        const studentMessage = document.createElement('div');
        studentMessage.className = 'message message-student';
        studentMessage.innerHTML = `<p class="mb-0">${questionInput.value}</p>`;
        messageList.appendChild(studentMessage);
        
        // If has image
        if (imageUpload.files[0]) {
            const imageMessage = document.createElement('div');
            imageMessage.className = 'message message-student';
            imageMessage.innerHTML = `<img src="${imagePreview.src}" class="img-fluid rounded mb-2" alt="Uploaded question">`;
            messageList.appendChild(imageMessage);
            previewContainer.classList.add('d-none');
            imageUpload.value = '';
        }
        
        // Scroll to bottom
        messageList.scrollTop = messageList.scrollHeight;
        
        // Simulate AI response (in a real app, this would be an API call)
        setTimeout(() => {
            const aiTyping = document.createElement('div');
            aiTyping.className = 'message message-ai';
            aiTyping.innerHTML = '<p class="mb-0"><i class="fas fa-circle-notch fa-spin me-2"></i>AI思考中...</p>';
            messageList.appendChild(aiTyping);
            messageList.scrollTop = messageList.scrollHeight;
            
            setTimeout(() => {
                // Remove typing indicator
                messageList.removeChild(aiTyping);
                
                // Add AI response
                const aiResponse = document.createElement('div');
                aiResponse.className = 'message message-ai';
                
                // Sample responses based on input
                let responseText = '我需要更多信息来回答这个问题。请提供更多细节或者尝试重新表述您的问题。';
                
                if (questionInput.value.toLowerCase().includes('微分方程')) {
                    responseText = '解二阶微分方程通常有以下步骤：<br>1. 确定方程类型（线性、非线性等）<br>2. 对于线性方程，寻找通解和特解<br>3. 应用初始条件<br><br>您能提供具体的方程吗？';
                } else if (questionInput.value.toLowerCase().includes('矩阵')) {
                    responseText = '矩阵特征值的计算步骤：<br>1. 写出特征方程：det(A-λI)=0<br>2. 展开行列式得到多项式<br>3. 求解该多项式的根<br><br>需要我展示一个具体例子吗？';
                } else if (questionInput.value.toLowerCase().includes('傅里叶')) {
                    responseText = '傅里叶变换的物理意义是将时域信号分解为不同频率的正弦波的叠加。它告诉我们信号中包含哪些频率成分及其强度。<br><br>在工程中，这帮助我们分析信号特性、设计滤波器等。您想了解更具体的应用场景吗？';
                }
                
                aiResponse.innerHTML = `<p class="mb-0">${responseText}</p>
                <div class="mt-3">
                    <button class="btn btn-sm btn-outline-primary me-2">需要更详细解释</button>
                    <button class="btn btn-sm btn-outline-secondary me-2">查看相关知识点</button>
                    <div class="mt-2">
                        <button class="btn btn-sm btn-outline-success me-1"><i class="fas fa-thumbs-up me-1"></i>有帮助</button>
                        <button class="btn btn-sm btn-outline-danger me-1"><i class="fas fa-thumbs-down me-1"></i>没帮助</button>
                        <button class="btn btn-sm btn-outline-info">转教师答疑</button>
                    </div>
                </div>`;
                
                messageList.appendChild(aiResponse);
                messageList.scrollTop = messageList.scrollHeight;
            }, 1500);
        }, 500);
        
        questionInput.value = '';
    });
}

// Assignment Page functionalities
if (document.getElementById('assignment-tabs')) {
    const tabLinks = document.querySelectorAll('.assignment-tab');
    
    tabLinks.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all tabs
            tabLinks.forEach(t => {
                t.classList.remove('active');
                document.getElementById(t.getAttribute('data-bs-target').substring(1)).classList.remove('show', 'active');
            });
            
            // Add active class to current tab
            this.classList.add('active');
            document.getElementById(this.getAttribute('data-bs-target').substring(1)).classList.add('show', 'active');
        });
    });
}

// Knowledge Base Page functionalities
if (document.getElementById('knowledge-search')) {
    const searchInput = document.getElementById('knowledge-search');
    const knowledgeCards = document.querySelectorAll('.knowledge-card');
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        knowledgeCards.forEach(card => {
            const title = card.querySelector('.card-title').textContent.toLowerCase();
            const tags = card.querySelector('.card-tags').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || tags.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Create directory placeholder function
function createFolder() {
    alert('文件夹创建功能尚在开发中');
}

// Upload document placeholder function
function uploadDocument() {
    alert('文档上传功能尚在开发中');
}

// Start new assignment placeholder function
function startAssignment(id) {
    window.location.href = 'assignment-details.html?id=' + id;
}

// Submit assignment placeholder function
function submitAssignment() {
    alert('作业已成功提交！');
    window.location.href = 'assignment.html';
} 