import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Seo } from "@/components/seo/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { StoryModeLogo } from "@/components/brand/StoryModeLogo";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";
import { pickRandomBackground } from "@/lib/backgrounds";
import { AUTH_CARD_CLASS, AUTH_CARD_CONTENT_CLASS, LABEL_CLASS, SUBMIT_CLASS } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat p-4"
      style={{ backgroundImage: `url(${background.url})` }}
    >
      <Seo
        title="Page not found — StoryMode — Write Stories. Create Worlds."
        description="This StoryMode page could not be found. Head back to the homepage to keep writing your story, building timelines and drawing your world maps."
        path={location.pathname}
        noindex
      />
      <div className="absolute inset-0 bg-black/40" />
      <BackgroundCredit background={background} />
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <Card className={AUTH_CARD_CLASS}>
          <CardContent className={cn(AUTH_CARD_CONTENT_CLASS, "text-center")}>
            <StoryModeLogo word="Sorry" className="justify-center" markClassName="h-9 w-9" wordmarkClassName="text-4xl" />
            <p className={cn(LABEL_CLASS, "ml-0 mt-8")}>{t("notFound.code")}</p>
            <h1 className="mt-2 font-sans text-2xl font-semibold text-foreground">{t("notFound.title")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("notFound.description")}</p>
            <a
              href="/"
              className={cn(
                SUBMIT_CLASS,
                "mt-8 inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {t("notFound.returnHome")}
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NotFound;
