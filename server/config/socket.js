const { Server } =
    require("socket.io");

function createSocket(
    httpServer
) {

    return new Server(
        httpServer,
        {
            cors: {
                origin:
                    process.env.CLIENT_URL,
                methods: [
                    "GET",
                    "POST"
                ]
            }
        }
    );
}

module.exports =
    createSocket;
