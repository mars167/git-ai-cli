package com.example.app.api;

import com.example.lib.service.GreetingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PingController {
  private final GreetingService greetingService;

  public PingController(GreetingService greetingService) {
    this.greetingService = greetingService;
  }

  @GetMapping("/ping")
  public String ping(@RequestParam(defaultValue = "world") String name) {
    return greetingService.greet(name).message();
  }
}

