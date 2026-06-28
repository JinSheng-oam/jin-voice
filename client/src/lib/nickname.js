const randomNicknames = [
    '风一样的', '神秘的', '可爱的', '暴躁的', '佛系', '社恐', '话痨', '干饭',
    '摸鱼的', '肝帝', '咕咕咕', '鸽王', '卷王', '躺平的', '养生', '熬夜',
];

const randomAnimals = [
    '小猫咪', '小狗狗', '小兔叽', '小熊猫', '小企鹅', '小海豹', '小水獭', '小狐狸',
    '小仓鼠', '皮卡丘', '杰尼龟', '妙蛙种', '小火龙', '伊布', '可达鸭', '胖丁',
];

export const generateRandomNickname = () => {
    const prefix = randomNicknames[Math.floor(Math.random() * randomNicknames.length)];
    const animal = randomAnimals[Math.floor(Math.random() * randomAnimals.length)];
    return `${prefix}${animal}`;
};

export const getInitialNickname = () => {
    const saved = localStorage.getItem('anydrop_nickname');
    return saved || generateRandomNickname();
};

export const normalizeNickname = (value = '') => value.trim().slice(0, 24);

export const saveNickname = (value = '') => {
    const normalized = normalizeNickname(value) || generateRandomNickname();
    localStorage.setItem('anydrop_nickname', normalized);
    return normalized;
};
