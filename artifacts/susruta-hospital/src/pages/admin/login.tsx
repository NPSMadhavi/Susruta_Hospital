import React, { useState } from "react";
import { useAdminLogin } from "@workspace/api-client-react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { executeRecaptcha, RecaptchaLegalNotice } from "@/lib/recaptcha";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const loginMutation = useAdminLogin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const recaptchaToken = await executeRecaptcha("admin_login");

    loginMutation.mutate(
      {
        data: {
          username,
          password,
          ...(recaptchaToken ? { recaptchaToken } : {}),
        } as any,
      },
      {
        onSuccess: () => {
          window.location.href = "/admin";
        },
        onError: (err: any) => {
          const status = err?.status ?? err?.response?.status;
          const msg = err?.data?.message || err?.message;

          if (status === 401) {
            setError("Incorrect username or password. Please try again.");
          } else if (err?.data?.error === "recaptcha_failed") {
            setError(msg || "Security verification failed. Please try again.");
          } else {
            setError(
              msg || "Unable to sign in. Please check your connection and try again."
            );
          }
        },
      }
    );
  };

  return (
    <div
      className="
        min-h-svh
        font-['DM_Sans',sans-serif]
        flex
        items-center
        justify-center
        px-5
        bg-[url('/admin_login_img.png')]
        bg-cover
        bg-center
        bg-no-repeat
        text-[#1d1d1d]
      "
    >
      <div
        className="
          w-[637px]
          px-[65px]
          py-[55px]
          rounded-[24px]
          bg-[#fafafa]
          text-center

          max-[640px]:w-full
          max-[640px]:px-7
          max-[640px]:py-[45px]
        "
      >
        {/* Logo */}
        <img
          src={logoImg}
          alt="Susruta Hospital"
          className="
            block
            w-full
            h-[57px]
            object-contain
            mx-auto
            max-[640px]:h-auto
          "
        />

        {/* Heading */}
        <h1
          className="
            mt-[10px]
            mb-[18px]
            font-['DM_Sans']
            text-[30px]
            font-bold
            leading-[46px]
            tracking-[-1px]
            max-[640px]:text-[30px]
          "
        >
          Admin Access
        </h1>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="text-left [&>div+div]:mt-[18px]"
        >
          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Username */}
          <div>
            <label
              className="block mb-[7px] text-[14px] leading-5 font-normal"
              htmlFor="admin-username"
            >
              Username
            </label>

            <input
              type="text"
              id="admin-username"
              autoComplete="username"
              placeholder="Enter your username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="
                w-full
                h-[46px]
                py-0
                border
                border-[#dce4ef]
                rounded-[12px]
                bg-white
                text-[14px]
                outline-none
                focus:border-[#93a5bf]
                focus:shadow-[0_0_0_3px_#93a5bf26]
                px-3.5
              "
            />
          </div>

          {/* Password */}
          <div>
            <label
              className="block mb-[7px] text-[14px] leading-5 font-normal"
              htmlFor="admin-password"
            >
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="admin-password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="
                  w-full
                  h-[46px]
                  py-0
                  border
                  border-[#dce4ef]
                  rounded-[12px]
                  bg-white
                  text-[14px]
                  outline-none
                  focus:border-[#93a5bf]
                  focus:shadow-[0_0_0_3px_#93a5bf26]
                  pl-3.5
                  pr-12
                "
              />

              <button
                type="button"
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
                aria-pressed={showPassword}
                onClick={() =>
                  setShowPassword((value) => !value)
                }
                className="
                  absolute
                  right-3.5
                  top-1/2
                  -translate-y-1/2
                  text-[#93a5bf]
                  hover:text-foreground
                "
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="
              w-full
              h-[49px]
              flex
              items-center
              justify-center
              gap-2
              rounded-[12px]
              bg-[#da592b]
              text-white
              text-[14px]
              font-semibold
              cursor-pointer
              transition-[background]
              duration-200
              hover:bg-[#c84d23]
              disabled:opacity-60
              disabled:cursor-wait
              focus-visible:outline-[3px]
              focus-visible:outline-[#93a5bf]
              focus-visible:outline-offset-[3px]
              mt-[30px]
            "
          >
            {loginMutation.isPending ? "Logging in..." : "Login"}

            {!loginMutation.isPending && (
              <ArrowRight
                size={15}
                aria-hidden="true"
              />
            )}
          </button>

          <RecaptchaLegalNotice className="mt-4 text-center" />
        </form>
      </div>
    </div>
  );
}