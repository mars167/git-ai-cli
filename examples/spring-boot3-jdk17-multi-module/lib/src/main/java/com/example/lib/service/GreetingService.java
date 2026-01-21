package com.example.lib.service;

import com.example.lib.model.Greeting;
import org.springframework.stereotype.Service;

@Service
public class GreetingService {
  public Greeting greet(String name) {
    return new Greeting("hello " + name);
  }
}

