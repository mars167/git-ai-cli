package com.example.demo.model;

public record Greeting(String message) {
  public static Greeting of(String name) {
    return new Greeting("hello " + name);
  }
}

