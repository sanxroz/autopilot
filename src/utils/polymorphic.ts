import * as React from "react";

type AsProp<T extends React.ElementType> = {
  as?: T;
};

type PropsToOmit<T extends React.ElementType, P> = keyof (AsProp<T> & P);

type PolymorphicComponentProps<
  T extends React.ElementType,
  Props = object
> = React.PropsWithChildren<Props & AsProp<T>> &
  Omit<React.ComponentPropsWithoutRef<T>, PropsToOmit<T, Props>>;

type PolymorphicRef<T extends React.ElementType> =
  React.ComponentPropsWithRef<T>["ref"];

type PolymorphicComponentPropsWithRef<
  T extends React.ElementType,
  Props = object
> = PolymorphicComponentProps<T, Props> & { ref?: PolymorphicRef<T> };

export type { PolymorphicComponentProps, PolymorphicComponentPropsWithRef };
