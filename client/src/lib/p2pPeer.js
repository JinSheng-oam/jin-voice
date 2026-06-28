export const bindPeerEvents = ({
    peer,
    onSignal,
    onStream,
    onData,
    onError,
    onClose,
    onConnect
}) => {
    if (onSignal) peer.on('signal', onSignal);
    if (onStream) peer.on('stream', onStream);
    if (onData) peer.on('data', onData);
    if (onError) peer.on('error', onError);
    if (onClose) peer.on('close', onClose);
    if (onConnect) peer.on('connect', onConnect);
};
