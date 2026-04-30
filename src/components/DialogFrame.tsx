import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type DialogFrameProps = {
  rootHeight: number;
  isSplit: boolean;
  borderColor: string;
  title: React.ReactNode;
  titleColor?: string;
  subtitle?: string;
  subtitleColor?: string;
  footer?: string;
  children?: React.ReactNode;
};

export const DialogFrame = ({
  rootHeight,
  isSplit,
  borderColor,
  title,
  titleColor = theme.colors.text,
  subtitle,
  subtitleColor = theme.colors.text,
  footer,
  children,
}: DialogFrameProps) => (
  <Box
    position="absolute"
    top={Math.max(2, Math.floor(rootHeight / 5))}
    left={2}
    right={2}
    justifyContent="center"
  >
    <Box
      width={isSplit ? 75 : "100%"}
      borderStyle="round"
      borderColor={borderColor}
      backgroundColor={theme.colors.surface}
      borderTopBackgroundColor={theme.colors.surface}
      borderBottomBackgroundColor={theme.colors.surface}
      borderLeftBackgroundColor={theme.colors.surface}
      borderRightBackgroundColor={theme.colors.surface}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      {typeof title === "string" ? (
        <Text bold color={titleColor}>{title}</Text>
      ) : (
        title
      )}
      {subtitle ? (
        <Box marginTop={1}>
          <Text color={subtitleColor}>{subtitle}</Text>
        </Box>
      ) : null}
      {children}
      {footer ? (
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>{footer}</Text>
        </Box>
      ) : null}
    </Box>
  </Box>
);
