import React from 'react';
import { FiShield, FiTrash2, FiUserCheck } from 'react-icons/fi';
import { helperTextStyle, sectionCardStyle } from './settingsStyles';

const AdminUsersSection = ({ model }) => {
    const { adminError, adminLoading, adminSavingId, adminUsers, deleteAdminUser,
        loadAdminUsers, updateAdminUser, user } = model;
    return (
                            <div style={{ maxWidth: '760px' }}>
                                <section>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '16px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '10px',
                                                background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <FiShield size={16} color="#fff" />
                                            </div>
                                            <span style={{ fontSize: '15px', fontWeight: '600' }}>成员账户管理</span>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => void loadAdminUsers()}
                                            disabled={adminLoading}
                                        >
                                            刷新成员
                                        </button>
                                    </div>

                                    <div style={sectionCardStyle}>
                                        <p style={{ ...helperTextStyle, marginTop: 0, marginBottom: '16px' }}>
                                            当前登录账号：{user?.displayName || user?.email}。管理员账号由服务端启动配置创建或由现有管理员授权。
                                        </p>

                                        {adminError && (
                                            <div style={{
                                                marginBottom: '16px',
                                                borderRadius: '12px',
                                                padding: '12px 14px',
                                                background: 'rgba(239, 68, 68, 0.12)',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                color: 'var(--danger)',
                                                fontSize: '13px'
                                            }}>
                                                {adminError}
                                            </div>
                                        )}

                                        {adminLoading ? (
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>正在加载成员列表...</div>
                                        ) : (
                                            <div style={{ display: 'grid', gap: '12px' }}>
                                                {adminUsers.map((member) => (
                                                    <div
                                                        key={member.id}
                                                        style={{
                                                            border: '1px solid var(--border-light)',
                                                            background: 'var(--bg-subtle-panel)',
                                                            borderRadius: '14px',
                                                            padding: '14px 16px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '16px'
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{member.displayName}</strong>
                                                                {member.isAdmin && (
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        minHeight: '24px',
                                                                        padding: '0 10px',
                                                                        borderRadius: '999px',
                                                                        background: 'rgba(30, 184, 171, 0.12)',
                                                                        color: 'var(--primary)',
                                                                        fontSize: '11px',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        管理员
                                                                    </span>
                                                                )}
                                                                {member.id === user?.id && (
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        minHeight: '24px',
                                                                        padding: '0 10px',
                                                                        borderRadius: '999px',
                                                                        background: 'rgba(255, 255, 255, 0.08)',
                                                                        color: 'var(--text-secondary)',
                                                                        fontSize: '11px',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        当前账号
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                                                                {member.email}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary"
                                                                disabled={adminSavingId === member.id || member.id === user?.id}
                                                                onClick={() => void updateAdminUser(member.id, { isAdmin: !member.isAdmin })}
                                                                title={member.id === user?.id ? '不能修改自己的管理员权限' : ''}
                                                            >
                                                                <FiUserCheck size={14} />
                                                                {member.isAdmin ? '取消管理员' : '设为管理员'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-danger"
                                                                disabled={adminSavingId === member.id || member.id === user?.id}
                                                                onClick={() => void deleteAdminUser(member.id)}
                                                                title={member.id === user?.id ? '不能在这里删除自己的账号' : ''}
                                                            >
                                                                <FiTrash2 size={14} />
                                                                删除账户
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>

                            </div>
    );
};

export default AdminUsersSection;
