exports.login = async (
    req,
    res
) => {

    const token =
        await authService.login(
            req.body.email,
            req.body.password
        );

    res.json({ token });
};