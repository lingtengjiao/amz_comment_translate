#!/usr/bin/env python3
"""
修复 beta 用户的密码哈希格式
使用 passlib bcrypt 生成正确格式的哈希
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 100个beta用户的密码列表 (从 beta_users_100_passwords.txt 提取)
passwords = {
    "beta1@lesong.com": "aJZmsG9N#vYt",
    "beta2@lesong.com": "856uNtfwP@3m",
    "beta3@lesong.com": "IG8vBK@uY&rj",
    "beta4@lesong.com": "zPFUmUvyv^$2",
    "beta5@lesong.com": "d4%Wi7x807%i",
    "beta6@lesong.com": "k^u&cqI0Ve9Y",
    "beta7@lesong.com": "QIsP8KsJtY&o",
    "beta8@lesong.com": "q9Q4u@*u4oc@",
    "beta9@lesong.com": "ToZUo4BmFe6&",
    "beta10@lesong.com": "d2E&NNNzL%4c",
    "beta11@lesong.com": "!W3E6A&wBFE8",
    "beta12@lesong.com": "iYkJfDu^WVJL",
    "beta13@lesong.com": "G4gHCH*Zzxza",
    "beta14@lesong.com": "7P!UkLxGPPX7",
    "beta15@lesong.com": "NRq8@$65z9Oo",
    "beta16@lesong.com": "LB@kzW4VF@c&",
    "beta17@lesong.com": "9yX5pY4h*6HM",
    "beta18@lesong.com": "o#bC5n0xLNpQ",
    "beta19@lesong.com": "A2JDSh&s6$jh",
    "beta20@lesong.com": "@O0&E8kMw^xq",
    "beta21@lesong.com": "%UL2HnqFz5yb",
    "beta22@lesong.com": "X*rW3pxf5Q7q",
    "beta23@lesong.com": "Pt*VPFj^dA^L",
    "beta24@lesong.com": "@l%Fsr^M$XW4",
    "beta25@lesong.com": "kZNxs*Z4*&5M",
    "beta26@lesong.com": "w24&tZkx!pMN",
    "beta27@lesong.com": "84N1u9&gMRyj",
    "beta28@lesong.com": "Fmd^*u#a%hGb",
    "beta29@lesong.com": "kEr&^Yz@RRTJ",
    "beta30@lesong.com": "v0kRjl9j3Wcd",
    "beta31@lesong.com": "NxzRvbXUp#JN",
    "beta32@lesong.com": "@q1#l&Ec4$m5",
    "beta33@lesong.com": "u6fE8*c%zqmV",
    "beta34@lesong.com": "!00z^LQqThCb",
    "beta35@lesong.com": "%$LVB$9mzJn&",
    "beta36@lesong.com": "8XW0$ry&yevf",
    "beta37@lesong.com": "*!r2Rg%93M1Z",
    "beta38@lesong.com": "V7Dw4P0#Q#8E",
    "beta39@lesong.com": "@FMDf6Y@5V^f",
    "beta40@lesong.com": "G0YlB0Jjt&7M",
    "beta41@lesong.com": "X^%y&dqT7%Ey",
    "beta42@lesong.com": "!Mq$g!18pUhb",
    "beta43@lesong.com": "5N$1ZNLVIh0w",
    "beta44@lesong.com": "!tQz$58b!zW%",
    "beta45@lesong.com": "mXNt^sM&W5&u",
    "beta46@lesong.com": "u*jVJgn&1VeL",
    "beta47@lesong.com": "&ZiQDsZ@9c6F",
    "beta48@lesong.com": "Phl*@0NzQU^b",
    "beta49@lesong.com": "EJpjbHuGk@$A",
    "beta50@lesong.com": "bT&J5e9LQ1BO",
    "beta51@lesong.com": "D5JZsK!@i!I^",
    "beta52@lesong.com": "t*g%#g&JCC*9",
    "beta53@lesong.com": "3$#W8@%KMXGL",
    "beta54@lesong.com": "MoS3gL!JtLsB",
    "beta55@lesong.com": "R8*CKDW&^fBf",
    "beta56@lesong.com": "8IpG&RK^UT*y",
    "beta57@lesong.com": "k3#^ZHk@7fJx",
    "beta58@lesong.com": "gJLH1WLvJ*Qz",
    "beta59@lesong.com": "zF&5cFB5NHvZ",
    "beta60@lesong.com": "xH2v7Cd*@pMF",
    "beta61@lesong.com": "4Hf&FVbZ91#E",
    "beta62@lesong.com": "S#t4tL*$61*B",
    "beta63@lesong.com": "Gs4%tXe0IHBN",
    "beta64@lesong.com": "$Xz8DRxMNn!s",
    "beta65@lesong.com": "xNx55@Bc3@%m",
    "beta66@lesong.com": "^hWV%!mLhG5$",
    "beta67@lesong.com": "%XUT3J#8Ep4f",
    "beta68@lesong.com": "V7L@$&I6#0K!",
    "beta69@lesong.com": "^QSjm9iR*0I1",
    "beta70@lesong.com": "gf^xpn!Eaw&3",
    "beta71@lesong.com": "G0MwU&Gf&Hb*",
    "beta72@lesong.com": "A2#$0N*J1IYQ",
    "beta73@lesong.com": "UNXyzj2^6#bR",
    "beta74@lesong.com": "H!yVprfZ*M@a",
    "beta75@lesong.com": "Z1BUYzl1T%1t",
    "beta76@lesong.com": "7JuDMFif*6RL",
    "beta77@lesong.com": "2!K1Zj0NzQ3Q",
    "beta78@lesong.com": "&FKm#@N35#53",
    "beta79@lesong.com": "m9X%^K%y!%6e",
    "beta80@lesong.com": "g^dTf*AY2d#&",
    "beta81@lesong.com": "&Ck&*FU7zb*2",
    "beta82@lesong.com": "u7e9*$w^v2LE",
    "beta83@lesong.com": "iM6@z^Mh4NX3",
    "beta84@lesong.com": "dJ3QKq8awXG*",
    "beta85@lesong.com": "Xq$D1w#V&vRs",
    "beta86@lesong.com": "E4%K3!Ub!9g5",
    "beta87@lesong.com": "U5Yy%5bz7#qx",
    "beta88@lesong.com": "7G$T*90ZdPPt",
    "beta89@lesong.com": "4z@Y$K^x2jQY",
    "beta90@lesong.com": "PZxv&R7fAkKR",
    "beta91@lesong.com": "S@!WqMIl!gWB",
    "beta92@lesong.com": "e0@A1$B%Zt&r",
    "beta93@lesong.com": "KWgG^x*&5!c0",
    "beta94@lesong.com": "!2w2U*0qp*H5",
    "beta95@lesong.com": "!N8OC&xhyGKq",
    "beta96@lesong.com": "f7NFGBZ#8^w$",
    "beta97@lesong.com": "j*DZ!MJ1J!ww",
    "beta98@lesong.com": "!NNNv@Px@UXB",
    "beta99@lesong.com": "WZMm!NNqZl&7",
    "beta100@lesong.com": "^v2z*X0RIgzR",
}

# 生成SQL更新语句
print("-- 修复 beta 用户密码哈希")
print("BEGIN;")
print()

for email, password in passwords.items():
    hashed = pwd_context.hash(password)
    # 转义SQL中的单引号
    print(f"UPDATE users SET password_hash = '{hashed}' WHERE email = '{email}';")

print()
print("COMMIT;")
print()
print(f"-- 共更新 {len(passwords)} 个用户")
