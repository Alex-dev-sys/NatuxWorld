use super::*;

#[test]
fn login_2fa_challenge_matches_renderer_shape_without_a_jwt() {
    let transport = Arc::new(StubTransport::new(vec![response(
        200,
        json!({"twoFactorRequired":true,"method":"totp","challenge":"short-lived-challenge"}),
    )]));
    let credentials = Arc::new(MemoryCredentials::new(None));
    let result = run(service(transport.clone(), credentials).login(LoginRequest {
        login: "Natux".into(),
        password: "password".into(),
    }));
    let value = serde_json::to_value(result).unwrap();
    assert_eq!(
        value,
        json!({"ok":true,"data":{"twoFactor":true,"method":"totp","challenge":"short-lived-challenge"}})
    );
    assert!(!value.to_string().contains(TOKEN));
    let requests = transport.take_requests();
    assert_eq!(requests[0].path, "/login");
    assert_eq!(
        requests[0].body,
        Some(json!({"login":"Natux","password":"password"}))
    );
    assert_eq!(requests[0].token, None);
}

#[test]
fn verify_and_second_factor_store_tokens_but_only_return_user_dtos() {
    let transport = Arc::new(StubTransport::new(vec![
        response(200, json!({"token":TOKEN,"user":user()})),
        response(200, json!({"token":"second-jwt","user":user()})),
    ]));
    let credentials = Arc::new(MemoryCredentials::new(None));
    let service = service(transport.clone(), credentials.clone());
    let verified = run(service.verify(VerifyRequest {
        email: "player@example.test".into(),
        code: "123456".into(),
    }));
    let verify_json = serde_json::to_value(verified).unwrap();
    assert_eq!(verify_json["data"]["username"], "Natux");
    assert!(!verify_json.to_string().contains(TOKEN));
    assert!(credentials
        .value
        .lock()
        .unwrap()
        .as_deref()
        .unwrap()
        .contains(TOKEN));

    let two_factor = run(service.login_two_factor(LoginTwoFactorRequest {
        challenge: "challenge".into(),
        code: "654321".into(),
    }));
    let two_factor_json = serde_json::to_value(two_factor).unwrap();
    assert_eq!(
        two_factor_json,
        json!({"ok":true,"data":{"twoFactor":false,"user":{"id":"u_test","username":"Natux","email":"player@example.test"}}})
    );
    assert!(!two_factor_json.to_string().contains("second-jwt"));
    let requests = transport.take_requests();
    assert_eq!(requests[0].path, "/verify-email");
    assert_eq!(
        requests[0].body,
        Some(json!({"email":"player@example.test","code":"123456"}))
    );
    assert_eq!(requests[1].path, "/login/2fa");
    assert_eq!(
        requests[1].body,
        Some(json!({"challenge":"challenge","code":"654321"}))
    );
}

#[test]
fn register_and_resend_use_the_website_request_shapes() {
    let transport = Arc::new(StubTransport::new(vec![
        response(200, json!({"status":"verification_sent"})),
        response(200, json!({"status":"verification_sent"})),
    ]));
    let service = service(transport.clone(), Arc::new(MemoryCredentials::new(None)));
    assert!(matches!(
        run(service.register(RegisterRequest {
            username: "Natux".into(),
            email: "a@example.test".into(),
            password: "password".into()
        })),
        AccountResult::Success { ok: true, .. }
    ));
    assert!(matches!(
        run(service.resend(ResendRequest {
            email: "a@example.test".into()
        })),
        AccountResult::Success { ok: true, .. }
    ));
    let requests = transport.take_requests();
    assert_eq!(requests[0].path, "/register");
    assert_eq!(
        requests[0].body,
        Some(json!({"username":"Natux","email":"a@example.test","password":"password"}))
    );
    assert_eq!(requests[1].path, "/resend-code");
    assert_eq!(requests[1].body, Some(json!({"email":"a@example.test"})));
}
