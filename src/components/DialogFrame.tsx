import React from "react";
import { Box, Text } from "ink";

type DialogFrameProps = {
  rootHeight: number;
  isSplit: boolean;
  borderColor: string;
  title: string;
  titleColor?: string;
  subtitle?: string;
  footer?: string;
  children?: React.ReactNode;
};

export const DialogFrame = ({
  rootHeight,
  isSplit,
  borderColor,
  title,
  titleColor = "white",
  subtitle,
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
      width={isSplit ? 75 : undefined}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Text bold color={titleColor}>
        {title}
      </Text>
      {subtitle ? (
        <Box marginTop={1}>
          <Text color="gray">{subtitle}</Text>
        </Box>
      ) : null}
      {children}
      {footer ? (
        <Box marginTop={1}>
          <Text color="gray">{footer}</Text>
        </Box>
      ) : null}
    </Box>
  </Box>
);
