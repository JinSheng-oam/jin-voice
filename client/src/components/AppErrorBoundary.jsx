import React from 'react';

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: error?.message || '页面发生未知渲染错误'
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[AppErrorBoundary] Uncaught render error:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div
                    role="alert"
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        padding: '24px',
                        background: '#0f172a',
                        color: '#f8fafc',
                        textAlign: 'center'
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>界面遇到异常</h2>
                    <p style={{ margin: 0, maxWidth: '420px', color: '#94a3b8', fontSize: '0.9rem' }}>
                        {this.state.errorMessage}
                    </p>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={this.handleReload}
                        style={{ marginTop: '8px' }}
                    >
                        重新加载页面
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
